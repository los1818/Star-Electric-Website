import ExcelJS from "exceljs";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ParseResult, ParsedItem, SheetRow } from "@/lib/imports/accubid";
import { costChangeBp, samePrice } from "@/lib/inventory-pricing";

// Accubid (Trimble) inventory export → Sparks inventory. Used by Inventory → Import in the app
// and by scripts/import-accubid-inventory. Re-runnable: items are matched on their SKU (derived
// from the description), so a newer export updates prices instead of adding duplicates.

type Db = PrismaClient | Prisma.TransactionClient;

/** Read the "Ext" sheet (or the first sheet) of an Accubid .xlsx export. */
export async function readAccubidWorkbook(data: ArrayBuffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet("Ext") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("That file has no worksheets.");
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.value ?? "").trim()));
  if (!headers.includes("Description") || !headers.includes("Net Cost")) {
    throw new Error(`Sheet "${sheet.name}" doesn't look like an Accubid inventory export (it needs Description and Net Cost columns).`);
  }
  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: SheetRow = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cell.value;
      // Formula cells carry their cached result.
      record[headers[col]] = v && typeof v === "object" && "result" in v ? v.result : v;
    });
    rows.push(record);
  });
  return rows;
}

export interface PriceDiff {
  sku: string;
  description: string;
  oldCostCents: number;
  newCostCents: number;
  changeBp: number | null;
}

export interface ImportPlan {
  parse: ParseResult;
  newItems: ParsedItem[];
  priceChanges: PriceDiff[];
  unchanged: number;
  /** Items in Sparks that aren't in the file (left as they are). */
  notInFile: number;
}

/** What importing this file would do, without changing anything. */
export async function planAccubidImport(db: Db, parse: ParseResult): Promise<ImportPlan> {
  const existing = new Map(
    (await db.inventoryItem.findMany({ select: { sku: true, tradePriceCents: true, discountBp: true, costCents: true, priceUnit: true } })).map((i) => [i.sku, i]),
  );
  const newItems: ParsedItem[] = [];
  const priceChanges: PriceDiff[] = [];
  let unchanged = 0;
  for (const item of parse.items) {
    const old = existing.get(item.sku);
    if (!old) newItems.push(item);
    else if (!samePrice(old, item) || old.priceUnit !== item.priceUnit) {
      priceChanges.push({ sku: item.sku, description: item.description, oldCostCents: old.costCents, newCostCents: item.costCents, changeBp: costChangeBp(old.costCents, item.costCents) });
    } else unchanged++;
  }
  const inFile = new Set(parse.items.map((i) => i.sku));
  priceChanges.sort((a, b) => Math.abs(b.changeBp ?? 0) - Math.abs(a.changeBp ?? 0));
  return { parse, newItems, priceChanges, unchanged, notInFile: [...existing.keys()].filter((sku) => !inFile.has(sku)).length };
}

export interface ApplyOptions {
  /** Also set warehouse stock to the file's quantities (first import); off = prices only. */
  updateStock: boolean;
  locationCode?: string;
  userId?: string | null;
  source: string;
}

/** Write the file's items: new ones are added, prices updated (with history), stock optional. */
export async function applyAccubidImport(db: PrismaClient, parse: ParseResult, opts: ApplyOptions) {
  const locationCode = opts.locationCode ?? "WH";
  const categories = new Map((await db.inventoryCategory.findMany()).map((c) => [c.code, c.id]));
  const units = new Map((await db.unitOfMeasure.findMany()).map((u) => [u.code, u.id]));
  const location = opts.updateStock
    ? await db.inventoryLocation.upsert({
        where: { code: locationCode },
        create: { code: locationCode, name: locationCode === "WH" ? "Main Warehouse" : locationCode, kind: "WAREHOUSE" },
        update: {},
      })
    : null;
  const batch = await db.importBatch.create({ data: { source: opts.source, dryRun: false } });

  let created = 0;
  let priced = 0;
  for (const item of parse.items) {
    await db.$transaction(async (tx) => {
      const pricing = {
        priceUnit: item.priceUnit,
        tradePriceCents: item.tradePriceCents,
        discountBp: item.discountBp,
        costCents: item.costCents,
        priceDate: item.priceDate,
      };
      const labour = {
        laborHours: item.laborHours === null ? null : new Prisma.Decimal(item.laborHours),
        laborUnit: item.laborUnit,
        noLabor: item.noLabor,
      };
      const existing = await tx.inventoryItem.findUnique({ where: { sku: item.sku } });
      let itemId: string;
      if (!existing) {
        // New item: Accubid's description, and a category/unit guessed from it (editable later).
        const row = await tx.inventoryItem.create({
          data: { sku: item.sku, description: item.description, categoryId: categories.get(item.categoryCode) ?? null, unitId: units.get(item.unitCode) ?? null, ...pricing, ...labour },
        });
        itemId = row.id;
        created++;
      } else {
        // Existing item: update prices only, keeping anything edited in Sparks (name, category, unit,
        // estimating labour).
        itemId = existing.id;
        await tx.inventoryItem.update({ where: { id: existing.id }, data: pricing });
        if (!samePrice(existing, item) || existing.priceUnit !== item.priceUnit) {
          priced++;
          await tx.inventoryPriceChange.create({
            data: {
              itemId,
              source: "IMPORT",
              note: existing.priceUnit !== item.priceUnit ? `${opts.source} (priced ${existing.priceUnit} -> ${item.priceUnit})` : opts.source,
              oldTradePriceCents: existing.tradePriceCents,
              newTradePriceCents: item.tradePriceCents,
              oldDiscountBp: existing.discountBp,
              newDiscountBp: item.discountBp,
              oldCostCents: existing.costCents,
              newCostCents: item.costCents,
              changedById: opts.userId ?? null,
            },
          });
        }
      }
      if (location) {
        await tx.stockLevel.upsert({
          where: { itemId_locationId: { itemId, locationId: location.id } },
          create: { itemId, locationId: location.id, quantity: new Prisma.Decimal(item.quantity) },
          update: { quantity: new Prisma.Decimal(item.quantity) },
        });
      }
    });
  }
  const summary = { created, priced, items: parse.items.length, stockUpdated: Boolean(location), valueCents: parse.importedTotalCents, issues: parse.issues.length };
  await db.importBatch.update({ where: { id: batch.id }, data: { finishedAt: new Date(), summary } });
  return summary;
}
