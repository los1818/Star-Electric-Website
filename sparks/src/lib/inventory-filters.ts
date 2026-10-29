import type { Prisma } from "@prisma/client";
import { STALE_PRICE_DAYS } from "@/lib/inventory-pricing";
import { activeFilter, param, type SearchParams } from "@/lib/list-params";

export const PRICE_UNIT_LABEL: Record<string, string> = { E: "each", C: "per 100", M: "per 1000" };
export const PRICE_UNIT_OPTIONS = [
  { value: "E", label: "Each (E)" },
  { value: "C", label: "Per 100 (C)" },
  { value: "M", label: "Per 1000 (M)" },
];

export const PRICE_AGE_OPTIONS = [
  { value: "", label: "Any price date" },
  { value: "stale", label: `Price older than ${STALE_PRICE_DAYS / 365} year` },
];

/** The list filters (search, category, price age, active), shared by the list and the price grid. */
export function inventoryWhere(sp: SearchParams, { pricing = true }: { pricing?: boolean } = {}): Prisma.InventoryItemWhereInput {
  const q = param(sp, "q");
  const category = param(sp, "category");
  const contains = { contains: q, mode: "insensitive" as const };
  return {
    ...activeFilter(sp),
    ...(category ? { categoryId: category } : {}),
    // Price age is pricing information: ignored for people who can't see prices.
    ...(pricing && param(sp, "age") === "stale" ? { OR: [{ priceDate: null }, { priceDate: { lt: new Date(Date.now() - STALE_PRICE_DAYS * 86_400_000) } }] } : {}),
    ...(q ? { AND: [{ OR: [{ description: contains }, { sku: contains }, { partNumber: contains }, { manufacturer: contains }] }] } : {}),
  };
}
