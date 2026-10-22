import { describe, expect, it } from "vitest";
import {
  applyRateBp,
  computeTotals,
  discountCents,
  divRoundHalfUp,
  formatCents,
  formatHours,
  lineAmountCents,
  parseCents,
  parseQuantityMilli,
  type TaxComponentRate,
} from "@/lib/money";

const GST: TaxComponentRate = { code: "GST", label: "GST", rateBp: 500 };
const PST: TaxComponentRate = { code: "PST", label: "PST", rateBp: 600 };

describe("divRoundHalfUp", () => {
  it("rounds halves away from zero", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
    expect(divRoundHalfUp(5n, 3n)).toBe(2n);
  });
  it("rejects division by zero", () => {
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(RangeError);
  });
});

describe("parseQuantityMilli", () => {
  it("parses whole and fractional quantities", () => {
    expect(parseQuantityMilli("2")).toBe(2000n);
    expect(parseQuantityMilli("1.5")).toBe(1500n);
    expect(parseQuantityMilli("0.125")).toBe(125n);
    expect(parseQuantityMilli(3.25)).toBe(3250n);
    expect(parseQuantityMilli("-1.5")).toBe(-1500n);
  });
  it("rejects more than three decimals and junk", () => {
    expect(() => parseQuantityMilli("1.2345")).toThrow(RangeError);
    expect(() => parseQuantityMilli("abc")).toThrow(RangeError);
    expect(() => parseQuantityMilli("")).toThrow(RangeError);
  });
});

describe("lineAmountCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineAmountCents("3", 1250)).toBe(3750);
    expect(lineAmountCents("7.5", 11500)).toBe(86250); // 7.5 h × $115.00
  });
  it("rounds half-up to the cent", () => {
    expect(lineAmountCents("0.5", 1)).toBe(1); // 0.5¢ → 1¢
    expect(lineAmountCents("0.333", 100)).toBe(33); // 33.3¢
    expect(lineAmountCents("1.005", 1000)).toBe(1005);
    expect(lineAmountCents("250", 89)).toBe(22250); // 250 ft of wire @ $0.89
  });
  it("avoids float drift", () => {
    // 0.1 + 0.2 style traps: 1.15 × 100¢ must be exactly 115¢.
    expect(lineAmountCents("1.15", 100)).toBe(115);
  });
  it("rejects non-integer cents", () => {
    expect(() => lineAmountCents("1", 1.5)).toThrow(RangeError);
  });
});

describe("applyRateBp", () => {
  it("applies basis-point rates", () => {
    expect(applyRateBp(10000, 500)).toBe(500);
    expect(applyRateBp(1999, 500)).toBe(100); // 99.95 → 100
    expect(applyRateBp(1990, 500)).toBe(100); // 99.5 → 100
    expect(applyRateBp(1989, 500)).toBe(99); // 99.45 → 99
  });
});

describe("discountCents", () => {
  it("handles none, percent and amount", () => {
    expect(discountCents(10000, { type: "NONE", value: 0 })).toBe(0);
    expect(discountCents(10000, { type: "PERCENT", value: 1000 })).toBe(1000);
    expect(discountCents(10000, { type: "AMOUNT", value: 2500 })).toBe(2500);
  });
  it("never exceeds the subtotal", () => {
    expect(discountCents(1000, { type: "AMOUNT", value: 5000 })).toBe(1000);
  });
  it("rejects bad discounts", () => {
    expect(() => discountCents(1000, { type: "PERCENT", value: 10001 })).toThrow(RangeError);
    expect(() => discountCents(1000, { type: "AMOUNT", value: -1 })).toThrow(RangeError);
  });
});

describe("computeTotals", () => {
  it("computes GST + PST on a simple invoice", () => {
    const t = computeTotals([
      { amountCents: 86250, taxComponents: [GST, PST] },
      { amountCents: 22250, taxComponents: [GST, PST] },
    ]);
    expect(t.subtotalCents).toBe(108500);
    expect(t.taxes).toEqual([
      { ...GST, taxableCents: 108500, taxCents: 5425 },
      { ...PST, taxableCents: 108500, taxCents: 6510 },
    ]);
    expect(t.taxCents).toBe(11935);
    expect(t.totalCents).toBe(120435);
  });

  it("taxes per document per component, not per line", () => {
    // Three lines of $0.10 at 5%: per-line rounding would give 3 × 1¢ = 3¢; per-document gives 2¢ (1.5 → 2).
    const lines = [10, 10, 10].map((amountCents) => ({ amountCents, taxComponents: [GST] }));
    expect(computeTotals(lines).taxCents).toBe(2);
  });

  it("supports mixed tax levels (labour GST-only, materials GST + PST)", () => {
    const t = computeTotals([
      { amountCents: 50000, taxComponents: [GST] },
      { amountCents: 20000, taxComponents: [GST, PST] },
      { amountCents: 5000, taxComponents: [] },
    ]);
    expect(t.taxes.find((x) => x.code === "GST")).toMatchObject({ taxableCents: 70000, taxCents: 3500 });
    expect(t.taxes.find((x) => x.code === "PST")).toMatchObject({ taxableCents: 20000, taxCents: 1200 });
    expect(t.totalCents).toBe(75000 + 4700);
  });

  it("applies the discount before tax, proportionally to each tax base", () => {
    const t = computeTotals(
      [
        { amountCents: 60000, taxComponents: [GST] },
        { amountCents: 40000, taxComponents: [GST, PST] },
      ],
      { type: "PERCENT", value: 1000 },
    );
    expect(t.discountCents).toBe(10000);
    expect(t.taxes.find((x) => x.code === "GST")).toMatchObject({ taxableCents: 90000, taxCents: 4500 });
    expect(t.taxes.find((x) => x.code === "PST")).toMatchObject({ taxableCents: 36000, taxCents: 2160 });
    expect(t.totalCents).toBe(100000 - 10000 + 6660);
  });

  it("handles an empty document", () => {
    expect(computeTotals([])).toEqual({ subtotalCents: 0, discountCents: 0, taxes: [], taxCents: 0, totalCents: 0 });
  });

  it("handles credit lines (negative amounts)", () => {
    const t = computeTotals([{ amountCents: -10000, taxComponents: [GST] }]);
    expect(t.taxCents).toBe(-500);
    expect(t.totalCents).toBe(-10500);
  });

  it("rejects a component with conflicting rates", () => {
    expect(() =>
      computeTotals([
        { amountCents: 100, taxComponents: [GST] },
        { amountCents: 100, taxComponents: [{ ...GST, rateBp: 700 }] },
      ]),
    ).toThrow(RangeError);
  });
});

describe("formatting and parsing", () => {
  it("formats CAD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
  });
  it("parses amounts", () => {
    expect(parseCents("$1,234.56")).toBe(123456);
    expect(parseCents("12.5")).toBe(1250);
    expect(parseCents("-3")).toBe(-300);
    expect(() => parseCents("1.234")).toThrow(RangeError);
  });
  it("formats hours", () => {
    expect(formatHours(750)).toBe("7.50");
  });
});
