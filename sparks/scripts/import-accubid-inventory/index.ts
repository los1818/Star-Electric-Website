import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseAccubidRows, type IssueKind, type ParseResult, type SheetRow } from "./parse";

// Import a Trimble Accubid inventory export (.xlsx, "Ext" sheet) into Sparks. See README.md.

const HELP = `
Usage: npx tsx scripts/import-accubid-inventory/index.ts --file <export.xlsx> [options]

  --file <path>       Accubid export (.xlsx) with an "Ext" sheet
  --apply             Write items and stock to the database (default is a dry run)
  --location <code>   Stock location code (default WH, created if missing)
  --help
`;

async function readSheet(file: string): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet("Ext") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found");
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.value ?? "").trim()));
  if (!headers.includes("Description") || !headers.includes("Net Cost")) {
    throw new Error(`Sheet "${sheet.name}" doesn't look like an Accubid extension sheet`);
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

const ISSUE_LABELS: Record<IssueKind, string> = {
  QTY_INFERRED: "Quantity inferred from value",
  QTY_MISSING: "Quantity missing",
  VALUE_MISMATCH: "Value doesn't match quantity × cost",
  DUPLICATE_MERGED: "Duplicate rows merged",
  STALE_PRICE: "Price older than 3 years",
  ZERO_STOCK: "Zero stock",
  BAD_ROW: "Row skipped",
  TOTALS_MISMATCH: "Totals don't match",
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderReport(file: string, result: ParseResult, applied: boolean): string {
  const byCategory = new Map<string, { count: number; value: number }>();
  for (const i of result.items) {
    const c = byCategory.get(i.categoryCode) ?? { count: 0, value: 0 };
    byCategory.set(i.categoryCode, { count: c.count + 1, value: c.value + i.valueCents });
  }
  const byKind = new Map<IssueKind, string[]>();
  for (const issue of result.issues) byKind.set(issue.kind, [...(byKind.get(issue.kind) ?? []), `${issue.description}: ${issue.detail}`]);

  const lines = [
    `# Accubid inventory import ${applied ? "(applied)" : "(dry run)"}`,
    "",
    `File: ${basename(file)} · ${new Date().toISOString()}`,
    "",
    `- Items: **${result.items.length}**`,
    `- Value at cost: **${money(result.importedTotalCents)}**${result.sheetTotalCents !== null ? ` (sheet total ${money(result.sheetTotalCents)})` : ""}`,
    `- Items with stock: ${result.items.filter((i) => i.quantity > 0).length}`,
    "",
    "## Categories (guessed from descriptions; fix in Sparks after import)",
    "",
    "| Category | Items | Value |",
    "|---|---:|---:|",
    ...[...byCategory].sort().map(([code, c]) => `| ${code} | ${c.count} | ${money(c.value)} |`),
    "",
    "## Things to check",
  ];
  for (const [kind, entries] of byKind) {
    lines.push("", `### ${ISSUE_LABELS[kind]} (${entries.length})`, "", ...entries.map((e) => `- ${e}`));
  }
  return `${lines.join("\n")}\n`;
}

async function apply(db: PrismaClient, result: ParseResult, file: string, locationCode: string) {
  const categories = new Map((await db.inventoryCategory.findMany()).map((c) => [c.code, c.id]));
  const units = new Map((await db.unitOfMeasure.findMany()).map((u) => [u.code, u.id]));
  const location = await db.inventoryLocation.upsert({
    where: { code: locationCode },
    create: { code: locationCode, name: locationCode === "WH" ? "Main Warehouse" : locationCode, kind: "WAREHOUSE" },
    update: {},
  });
  const batch = await db.importBatch.create({ data: { source: `accubid-inventory:${basename(file)}`, dryRun: false } });

  let created = 0;
  let updated = 0;
  for (const item of result.items) {
    const data = {
      description: item.description,
      categoryId: categories.get(item.categoryCode) ?? null,
      unitId: units.get(item.unitCode) ?? null,
      priceUnit: item.priceUnit,
      tradePriceCents: item.tradePriceCents,
      discountBp: item.discountBp,
      costCents: item.costCents,
      priceDate: item.priceDate,
      laborHours: item.laborHours === null ? null : new Prisma.Decimal(item.laborHours),
      laborUnit: item.laborUnit,
      noLabor: item.noLabor,
    };
    const existing = await db.inventoryItem.findUnique({ where: { sku: item.sku }, select: { id: true } });
    // Cost only: sell prices are set on each quote/invoice with that job's markup.
    const saved = existing
      ? await db.inventoryItem.update({ where: { id: existing.id }, data })
      : await db.inventoryItem.create({ data: { ...data, sku: item.sku } });
    if (existing) updated++;
    else created++;
    await db.stockLevel.upsert({
      where: { itemId_locationId: { itemId: saved.id, locationId: location.id } },
      create: { itemId: saved.id, locationId: location.id, quantity: new Prisma.Decimal(item.quantity) },
      update: { quantity: new Prisma.Decimal(item.quantity) },
    });
  }
  const summary = { created, updated, items: result.items.length, valueCents: result.importedTotalCents, issues: result.issues.length };
  await db.importBatch.update({ where: { id: batch.id }, data: { finishedAt: new Date(), summary } });
  return summary;
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      apply: { type: "boolean", default: false },
      location: { type: "string", default: "WH" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.file) {
    console.log(HELP);
    if (!values.help) process.exitCode = 1;
    return;
  }

  const result = parseAccubidRows(await readSheet(values.file));
  console.log(`${result.items.length} items, ${money(result.importedTotalCents)} at cost, ${result.issues.length} things to check`);

  if (values.apply) {
    const db = new PrismaClient();
    try {
      console.log("Applied:", await apply(db, result, values.file, values.location!));
    } finally {
      await db.$disconnect();
    }
  }

  const dir = join(__dirname, "reports");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}${values.apply ? "-applied" : "-dry-run"}.md`);
  await writeFile(out, renderReport(values.file, result, values.apply));
  console.log(`Report: ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
