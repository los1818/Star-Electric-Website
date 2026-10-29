import { lookupOptions } from "@/server/options";
import { PRICE_UNIT_OPTIONS } from "@/lib/inventory-filters";

export async function itemFormOptions() {
  const [categories, units] = await Promise.all([lookupOptions("inventory-categories"), lookupOptions("units")]);
  return { categories, units, priceUnits: PRICE_UNIT_OPTIONS };
}
