import { describe, expect, it } from "vitest";
import { adjustByPercent, costChangeBp, isStale, parseSignedPercentBp, priceFrom, samePrice } from "@/lib/inventory-pricing";

describe("inventory pricing", () => {
  it("works out net cost from trade price and discount", () => {
    expect(priceFrom(15000, 3500)).toEqual({ tradePriceCents: 15000, discountBp: 3500, costCents: 9750 });
  });

  it("adjusts trade prices by a percentage, keeping the discount, rounding to the cent", () => {
    expect(adjustByPercent(priceFrom(15000, 3500), 800)).toEqual({ tradePriceCents: 16200, discountBp: 3500, costCents: 10530 });
    expect(adjustByPercent(priceFrom(999, 0), -550)).toEqual({ tradePriceCents: 944, discountBp: 0, costCents: 944 });
    expect(adjustByPercent(priceFrom(100, 0), -9000).tradePriceCents).toBe(10);
  });

  it("reads percentages people type", () => {
    expect(parseSignedPercentBp("8")).toBe(800);
    expect(parseSignedPercentBp("+8%")).toBe(800);
    expect(parseSignedPercentBp("-5.5")).toBe(-550);
    expect(() => parseSignedPercentBp("0")).toThrow();
    expect(() => parseSignedPercentBp("150")).toThrow(/90%/);
    expect(() => parseSignedPercentBp("eight")).toThrow();
  });

  it("compares prices and measures change", () => {
    expect(samePrice(priceFrom(100, 0), priceFrom(100, 0))).toBe(true);
    expect(samePrice(priceFrom(100, 0), priceFrom(100, 100))).toBe(false);
    expect(costChangeBp(10000, 10800)).toBe(800);
    expect(costChangeBp(0, 500)).toBeNull();
  });

  it("flags prices over a year old (or never set)", () => {
    const now = new Date("2026-10-29");
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date("2025-06-01"), now)).toBe(true);
    expect(isStale(new Date("2026-03-01"), now)).toBe(false);
  });
});
