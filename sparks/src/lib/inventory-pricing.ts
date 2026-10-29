// Inventory price maths. Pure, unit-tested. Amounts are integer cents per the item's price unit
// (each / per 100 / per 1000, like Accubid); discounts and adjustments are basis points.
import { applyRateBp, netCostCents } from "./money";

export interface ItemPrice {
  tradePriceCents: number;
  discountBp: number;
  costCents: number;
}

/** Trade price and discount → the full price record (net cost worked out). */
export function priceFrom(tradePriceCents: number, discountBp: number): ItemPrice {
  return { tradePriceCents, discountBp, costCents: netCostCents(tradePriceCents, discountBp) };
}

/** Raise or lower a trade price by a percentage (basis points, e.g. 800 = +8%, -500 = -5%). Never below zero. */
export function adjustByPercent(price: ItemPrice, changeBp: number): ItemPrice {
  const trade = Math.max(0, price.tradePriceCents + applyRateBp(price.tradePriceCents, changeBp));
  return priceFrom(trade, price.discountBp);
}

export function samePrice(a: ItemPrice, b: ItemPrice): boolean {
  return a.tradePriceCents === b.tradePriceCents && a.discountBp === b.discountBp && a.costCents === b.costCents;
}

/** Net cost change as basis points of the old cost (null if there was no old cost). */
export function costChangeBp(oldCostCents: number, newCostCents: number): number | null {
  if (oldCostCents === 0) return null;
  return Math.round(((newCostCents - oldCostCents) * 10_000) / oldCostCents);
}

/** Prices older than this are flagged as needing a check. */
export const STALE_PRICE_DAYS = 365;

export function isStale(priceDate: Date | null, now = new Date()): boolean {
  return !priceDate || now.getTime() - priceDate.getTime() > STALE_PRICE_DAYS * 86_400_000;
}

/** "+8", "-5.5%", "8" → basis points (800, -550, 800). Limited to ±90%. */
export function parseSignedPercentBp(text: string): number {
  const m = /^([+-])?\s*(\d+)(?:\.(\d{1,2}))?\s*%?$/.exec(text.trim());
  if (!m) throw new RangeError(`Enter a percentage like 8 or -5.5, not "${text}"`);
  const bp = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (bp === 0) throw new RangeError("The percentage can't be 0");
  if (bp > 9000) throw new RangeError("Keep it within ±90% (a typo here would reprice everything)");
  return m[1] === "-" ? -bp : bp;
}
