// Money and tax maths. See docs/SPEC.md §5.
//
// - Amounts are integer cents. Rates are basis points (5% = 500, 100% = 10000).
// - Quantities are decimal strings/numbers with up to 3 decimals, handled internally as
//   integer thousandths so no floating-point maths ever touches money.
// - Rounding is half-up (half away from zero) to the cent.
// - Tax is computed per document per tax component on the sum of taxable lines (after the
//   document discount), not per line.

export type DiscountType = "NONE" | "PERCENT" | "AMOUNT";

export interface TaxComponentRate {
  code: string;
  label: string;
  rateBp: number;
}

export interface TotalsLine {
  amountCents: number;
  /** Tax components that apply to this line (from its tax level). Empty = not taxable. */
  taxComponents: TaxComponentRate[];
}

export interface Discount {
  type: DiscountType;
  /** Basis points for PERCENT, cents for AMOUNT. */
  value: number;
}

export interface TaxBreakdown extends TaxComponentRate {
  taxableCents: number;
  taxCents: number;
}

export interface DocumentTotals {
  subtotalCents: number;
  discountCents: number;
  taxes: TaxBreakdown[];
  taxCents: number;
  totalCents: number;
}

const BP = 10_000n;

function assertInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

/** Integer division rounding half away from zero. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

function toSafeNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Amount out of range: ${value}`);
  return n;
}

/**
 * Parse a quantity ("2", "1.5", "0.125", 3.25) into integer thousandths.
 * Rejects more than 3 decimal places rather than silently rounding.
 */
export function parseQuantityMilli(quantity: string | number): bigint {
  const text = typeof quantity === "number" ? quantity.toString() : quantity.trim();
  const match = /^(-)?(\d+)(?:\.(\d{0,3}))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid quantity: ${quantity}`);
  const [, sign, whole, frac = ""] = match;
  const milli = BigInt(whole) * 1000n + BigInt(frac.padEnd(3, "0"));
  return sign ? -milli : milli;
}

/** Line amount = quantity × unit price, rounded half-up to the cent. */
export function lineAmountCents(quantity: string | number, unitPriceCents: number): number {
  assertInt(unitPriceCents, "unitPriceCents");
  const milli = parseQuantityMilli(quantity);
  return toSafeNumber(divRoundHalfUp(milli * BigInt(unitPriceCents), 1000n));
}

/** amount × rate (basis points), rounded half-up to the cent. */
export function applyRateBp(amountCents: number, rateBp: number): number {
  assertInt(amountCents, "amountCents");
  assertInt(rateBp, "rateBp");
  return toSafeNumber(divRoundHalfUp(BigInt(amountCents) * BigInt(rateBp), BP));
}

/** Discount in cents for a subtotal. Never more than the subtotal. */
export function discountCents(subtotalCents: number, discount: Discount): number {
  assertInt(subtotalCents, "subtotalCents");
  assertInt(discount.value, "discount.value");
  if (discount.value < 0) throw new RangeError("Discount cannot be negative");
  let cents: number;
  switch (discount.type) {
    case "NONE":
      cents = 0;
      break;
    case "PERCENT":
      if (discount.value > 10_000) throw new RangeError("Percent discount cannot exceed 100%");
      cents = applyRateBp(subtotalCents, discount.value);
      break;
    case "AMOUNT":
      cents = discount.value;
      break;
  }
  return Math.min(cents, Math.max(subtotalCents, 0));
}

/**
 * Totals for a quote, invoice or PO.
 *
 * The document discount reduces each tax component's taxable base in proportion to that
 * base's share of the subtotal; tax is then computed once per component and rounded.
 */
export function computeTotals(lines: TotalsLine[], discount: Discount = { type: "NONE", value: 0 }): DocumentTotals {
  for (const line of lines) assertInt(line.amountCents, "amountCents");

  const subtotal = lines.reduce((sum, l) => sum + BigInt(l.amountCents), 0n);
  const subtotalCents = toSafeNumber(subtotal);
  const disc = discountCents(subtotalCents, discount);

  const bases = new Map<string, { rate: TaxComponentRate; base: bigint }>();
  for (const line of lines) {
    for (const component of line.taxComponents) {
      const existing = bases.get(component.code);
      if (existing && existing.rate.rateBp !== component.rateBp) {
        throw new RangeError(`Tax component ${component.code} has conflicting rates`);
      }
      const entry = existing ?? { rate: component, base: 0n };
      entry.base += BigInt(line.amountCents);
      bases.set(component.code, entry);
    }
  }

  const taxes: TaxBreakdown[] = [];
  for (const { rate, base } of bases.values()) {
    const share = subtotal === 0n ? 0n : divRoundHalfUp(BigInt(disc) * base, subtotal);
    const taxableCents = toSafeNumber(base - share);
    taxes.push({ ...rate, taxableCents, taxCents: applyRateBp(taxableCents, rate.rateBp) });
  }

  const taxCents = taxes.reduce((sum, t) => sum + t.taxCents, 0);
  return {
    subtotalCents,
    discountCents: disc,
    taxes,
    taxCents,
    totalCents: subtotalCents - disc + taxCents,
  };
}

const cadFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** 123456 → "$1,234.56" */
export function formatCents(cents: number): string {
  assertInt(cents, "cents");
  return cadFormatter.format(cents / 100);
}

/** Parse "$1,234.56" / "1234.5" / "-3" into cents. Rejects sub-cent precision. */
export function parseCents(text: string): number {
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) throw new RangeError(`Invalid amount: ${text}`);
  const [, sign, whole, frac = ""] = match;
  const cents = toSafeNumber(BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0")));
  return sign ? -cents : cents;
}

/** 750 → "7.50" */
export function formatHours(hundredths: number): string {
  assertInt(hundredths, "hundredths");
  return (hundredths / 100).toFixed(2);
}
