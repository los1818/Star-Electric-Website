"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { cleanFileName } from "@/lib/files";
import { parseAccubidRows } from "@/lib/imports/accubid";
import { adjustByPercent, parseSignedPercentBp, priceFrom, samePrice, type ItemPrice } from "@/lib/inventory-pricing";
import { parseCents } from "@/lib/money";
import { parsePercentBp } from "@/lib/markup";
import { parseDateOnly, reginaToday } from "@/lib/time";
import { checkbox, optionalId, optionalText, requiredId, requiredText } from "@/lib/validation";
import { inventoryWhere } from "@/lib/inventory-filters";
import { audit } from "@/server/audit";
import { applyAccubidImport, readAccubidWorkbook } from "@/server/imports/accubid";
import { storage } from "@/server/storage";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const PRICE_UNITS = ["E", "C", "M"] as const;

/** Prices are costs: only people who may see prices can change them. */
function assertPricing(user: CurrentUser) {
  if (!can(user.role, "pricing:view")) throw new ActionError("You don't have access to prices.");
}

async function recordPriceChange(tx: Prisma.TransactionClient, itemId: string, before: ItemPrice, after: ItemPrice, source: string, userId: string, note?: string) {
  await tx.inventoryPriceChange.create({
    data: {
      itemId,
      source,
      note,
      oldTradePriceCents: before.tradePriceCents,
      newTradePriceCents: after.tradePriceCents,
      oldDiscountBp: before.discountBp,
      newDiscountBp: after.discountBp,
      oldCostCents: before.costCents,
      newCostCents: after.costCents,
      changedById: userId,
    },
  });
}

/** Today in Regina, as a date (not tomorrow after 6 pm, which UTC would give). */
const today = () => parseDateOnly(reginaToday())!;

/** Largest trade price accepted ($1,000,000), well inside the database column. */
const MAX_PRICE_CENTS = 100_000_000;

// --- Accubid import ---------------------------------------------------------------------

/** Step 1: upload the export. It's kept aside and the preview page shows what would change. */
export const uploadAccubidFile = authorizedFormAction("inventory:write", z.object({}), async (_input, user, formData) => {
  assertPricing(user);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: "Choose the Accubid export (.xlsx)" });
  if (file.size > MAX_IMPORT_BYTES) throw new ValidationError({ file: "That file is over 20 MB" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // .xlsx files are zip archives: they start with "PK".
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ValidationError({ file: "That isn't an Excel (.xlsx) file. In Accubid, export the inventory to Excel." });
  try {
    parseAccubidRows(await readAccubidWorkbook(bytes.buffer));
  } catch (error) {
    throw new ValidationError({ file: (error as Error).message });
  }
  const token = randomUUID();
  await storage.put(`imports/${token}.xlsx`, bytes);
  return { redirectTo: `/inventory/import?file=${token}&name=${encodeURIComponent(cleanFileName(file.name, "export.xlsx"))}` };
});

/** Step 2: apply the previewed file. */
export const applyAccubidFile = authorizedFormAction(
  "inventory:write",
  z.object({ file: z.uuid({ error: "That upload has expired; upload the file again." }), updateStock: checkbox, fileName: optionalText(200) }),
  async ({ file, updateStock, fileName }, user) => {
    assertPricing(user);
    const key = `imports/${file}.xlsx`;
    const bytes = await storage.get(key);
    if (!bytes) throw new ActionError("That upload has expired; upload the file again.");
    const parse = parseAccubidRows(await readAccubidWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
    const summary = await applyAccubidImport(db, parse, { updateStock, userId: user.id, source: `Accubid import${fileName ? `: ${fileName}` : ""}` });
    await storage.delete(key);
    await audit(db, user.id, "import", "InventoryItem", "accubid", summary);
    revalidatePath("/inventory");
    return { redirectTo: `/inventory?imported=${summary.created}-${summary.priced}` };
  },
);

// --- Price updates ------------------------------------------------------------------------

/** Save the price grid: fields trade:<itemId> and disc:<itemId>; only changed items are touched. */
export const saveItemPrices = authorizedFormAction("inventory:write", z.object({}), async (_input, user, formData) => {
  assertPricing(user);
  const edits = new Map<string, { trade?: string; disc?: string }>();
  for (const [key, value] of formData.entries()) {
    const m = /^(trade|disc):(.+)$/.exec(key);
    if (!m || typeof value !== "string") continue;
    const e = edits.get(m[2]) ?? {};
    if (m[1] === "trade") e.trade = value;
    else e.disc = value;
    edits.set(m[2], e);
  }
  if (!edits.size) throw new ActionError("Nothing to save.");

  const items = await db.inventoryItem.findMany({ where: { id: { in: [...edits.keys()] } }, select: { id: true, description: true, tradePriceCents: true, discountBp: true, costCents: true } });
  const errors: Record<string, string> = {};
  const changes: { id: string; before: ItemPrice; after: ItemPrice }[] = [];
  for (const item of items) {
    const e = edits.get(item.id)!;
    try {
      const trade = e.trade === undefined ? item.tradePriceCents : parseCents(e.trade || "0");
      const disc = e.disc === undefined ? item.discountBp : parsePercentBp(e.disc || "0");
      if (trade < 0) throw new RangeError("can't be negative");
      if (trade > MAX_PRICE_CENTS) throw new RangeError("that's over $1,000,000; check the price");
      if (disc > 10_000) throw new RangeError("discount can't be over 100%");
      const after = priceFrom(trade, disc);
      if (!samePrice(item, after)) changes.push({ id: item.id, before: item, after });
    } catch (error) {
      errors[`trade:${item.id}`] = `${item.description}: ${(error as Error).message}`;
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (!changes.length) return { message: "No prices changed." };
  await db.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.inventoryItem.update({ where: { id: c.id }, data: { ...c.after, priceDate: today() } });
      await recordPriceChange(tx, c.id, c.before, c.after, "MANUAL", user.id);
    }
  });
  revalidatePath("/inventory");
  return { message: `Saved ${changes.length} price${changes.length === 1 ? "" : "s"}.` };
});

/** Raise or lower trade prices by a percentage for a category (or every active item). */
export const adjustPricesByPercent = authorizedFormAction(
  "inventory:write",
  z.object({ categoryId: optionalId, percent: requiredText("Percentage", 10), q: optionalText(100), age: optionalText(10) }),
  async ({ categoryId, percent, q, age }, user) => {
    assertPricing(user);
    let changeBp: number;
    try {
      changeBp = parseSignedPercentBp(percent);
    } catch (error) {
      throw new ValidationError({ percent: (error as Error).message });
    }
    // Exactly the items the price grid is showing (same search, category and price-age filters).
    const where: Prisma.InventoryItemWhereInput = { ...inventoryWhere({ q: q ?? "", category: categoryId ?? "", age: age ?? "" }), active: true };
    const items = await db.inventoryItem.findMany({ where, select: { id: true, tradePriceCents: true, discountBp: true, costCents: true } });
    if (!items.length) throw new ActionError("No items match, so nothing changed.");
    const category = categoryId ? await db.inventoryCategory.findUnique({ where: { id: categoryId }, select: { label: true } }) : null;
    const label = `${changeBp > 0 ? "+" : ""}${changeBp / 100}%`;
    const scope = [category?.label ?? "all items", q && `matching "${q}"`, age === "stale" && "with old prices"].filter(Boolean).join(" ");
    let changed = 0;
    await db.$transaction(
      async (tx) => {
        for (const item of items) {
          const after = adjustByPercent(item, changeBp);
          if (samePrice(item, after)) continue;
          if (after.tradePriceCents > MAX_PRICE_CENTS) throw new ActionError("That would put a price over $1,000,000; nothing was changed.");
          await tx.inventoryItem.update({ where: { id: item.id }, data: { ...after, priceDate: today() } });
          await recordPriceChange(tx, item.id, item, after, "PERCENT", user.id, `${label} on ${scope}`);
          changed++;
        }
        await audit(tx, user.id, "adjust_prices", "InventoryItem", categoryId ?? "all", { changeBp, q, changed });
      },
      { timeout: 120_000 },
    );
    revalidatePath("/inventory");
    return { message: `Trade prices ${changeBp > 0 ? "raised" : "lowered"} ${label} on ${changed} item${changed === 1 ? "" : "s"} (${scope}).` };
  },
);

// --- Items ----------------------------------------------------------------------------------

const itemFields = {
  description: requiredText("Description", 200),
  sku: optionalText(40),
  categoryId: optionalId,
  unitId: optionalId,
  manufacturer: optionalText(100),
  partNumber: optionalText(60),
  priceUnit: z.enum(PRICE_UNITS, { error: "Choose a price unit" }),
  tradePrice: requiredText("Trade price", 20),
  discount: optionalText(10),
  laborHours: optionalText(12),
  laborUnit: z.enum(PRICE_UNITS, { error: "Choose a labour unit" }),
  noLabor: checkbox,
  active: checkbox,
};

function itemData(input: z.infer<z.ZodObject<typeof itemFields>>) {
  const errors: Record<string, string> = {};
  let price: ItemPrice = priceFrom(0, 0);
  try {
    const trade = parseCents(input.tradePrice);
    if (trade < 0) throw new RangeError("Can't be negative");
    if (trade > MAX_PRICE_CENTS) throw new RangeError("That's over $1,000,000; check the price");
    const disc = input.discount ? parsePercentBp(input.discount) : 0;
    if (disc > 10_000) throw new RangeError("Discount can't be over 100%");
    price = priceFrom(trade, disc);
  } catch (error) {
    errors.tradePrice = (error as Error).message.replace(/^Invalid percentage.*/, "Check the discount");
  }
  let laborHours: Prisma.Decimal | null = null;
  if (input.laborHours) {
    if (!/^\d+(\.\d{1,2})?$/.test(input.laborHours)) errors.laborHours = "Enter hours like 0.25";
    else laborHours = new Prisma.Decimal(input.laborHours);
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    price,
    data: {
      description: input.description,
      categoryId: input.categoryId,
      unitId: input.unitId,
      manufacturer: input.manufacturer,
      partNumber: input.partNumber,
      priceUnit: input.priceUnit,
      laborHours,
      laborUnit: input.laborUnit,
      noLabor: input.noLabor,
      active: input.active,
    },
  };
}

export const createInventoryItem = authorizedFormAction("inventory:write", z.object(itemFields), async (input, user) => {
  assertPricing(user);
  const { price, data } = itemData(input);
  const sku = (input.sku ?? `SPK-${randomUUID().slice(0, 8)}`).toUpperCase();
  const item = await db.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({ data: { ...data, ...price, sku, priceDate: today() } });
    await audit(tx, user.id, "create", "InventoryItem", created.id, { sku, description: data.description });
    return created;
  });
  revalidatePath("/inventory");
  return { redirectTo: `/inventory/${item.id}` };
});

export const updateInventoryItem = authorizedFormAction("inventory:write", z.object({ id: requiredId("Item"), ...itemFields }), async ({ id, ...input }, user) => {
  assertPricing(user);
  const before = await db.inventoryItem.findUnique({ where: { id } });
  if (!before) throw new ActionError("That item no longer exists.");
  const { price, data } = itemData(input);
  // The SKU never changes after creation: Accubid imports find items by it.
  const sku = before.sku;
  const priceChanged = !samePrice(before, price);
  await db.$transaction(async (tx) => {
    await tx.inventoryItem.update({ where: { id }, data: { ...data, ...price, sku, ...(priceChanged ? { priceDate: today() } : {}) } });
    if (priceChanged) await recordPriceChange(tx, id, before, price, "MANUAL", user.id);
    await audit(tx, user.id, "update", "InventoryItem", id, { ...data, sku, ...price });
  });
  revalidatePath(`/inventory/${id}`);
  return { redirectTo: `/inventory/${id}` };
});
