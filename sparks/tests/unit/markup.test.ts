import { describe, expect, it } from "vitest";
import { formatPercentBp, materialCostCents, parsePercentBp, suggestMarkupBp, validateTiers } from "@/lib/markup";

const tiers = [
  { minMaterialCostCents: 500_000, markupBp: 1500 }, // $5,000+ → 15%
  { minMaterialCostCents: 0, markupBp: 3500 }, // $0+ → 35%
  { minMaterialCostCents: 100_000, markupBp: 2500 }, // $1,000+ → 25%
];

describe("suggestMarkupBp", () => {
  it("picks the highest tier the material cost reaches (order doesn't matter)", () => {
    expect(suggestMarkupBp(0, tiers)).toBe(3500);
    expect(suggestMarkupBp(99_999, tiers)).toBe(3500);
    expect(suggestMarkupBp(100_000, tiers)).toBe(2500);
    expect(suggestMarkupBp(499_999, tiers)).toBe(2500);
    expect(suggestMarkupBp(500_000, tiers)).toBe(1500);
    expect(suggestMarkupBp(10_000_000, tiers)).toBe(1500);
  });
  it("returns null with no tiers", () => {
    expect(suggestMarkupBp(1000, [])).toBeNull();
  });
});

describe("validateTiers", () => {
  it("accepts a sensible set", () => {
    expect(validateTiers(tiers)).toEqual([]);
  });
  it("requires a $0 starting tier, unique thresholds and sane markups", () => {
    expect(validateTiers([])).toEqual(["Add at least one tier."]);
    expect(validateTiers([{ minMaterialCostCents: 100, markupBp: 2000 }])).toContain("The first tier must start at $0 so every job gets a suggestion.");
    expect(validateTiers([{ minMaterialCostCents: 0, markupBp: 2000 }, { minMaterialCostCents: 0, markupBp: 1000 }])).toContain("Two tiers can't start at the same amount.");
    expect(validateTiers([{ minMaterialCostCents: 0, markupBp: -1 }])).toContain("Markups must be between 0% and 1000%.");
    expect(validateTiers([{ minMaterialCostCents: 0, markupBp: 100_001 }])).toContain("Markups must be between 0% and 1000%.");
  });
});

describe("materialCostCents", () => {
  it("sums material lines only, honouring Trimble price units", () => {
    expect(
      materialCostCents([
        { kind: "MATERIAL", quantity: "350", unitCostCents: 15000, priceUnit: "C" }, // $525.00
        { kind: "MATERIAL", quantity: "4", unitCostCents: 2500 }, // $100.00
        { kind: "LABOR", quantity: "8", unitCostCents: 5200 },
      ]),
    ).toBe(62500);
  });
});

describe("percent parsing", () => {
  it("parses and formats percentages", () => {
    expect(parsePercentBp("25")).toBe(2500);
    expect(parsePercentBp("25.5%")).toBe(2550);
    expect(parsePercentBp(" 7.25 ")).toBe(725);
    expect(() => parsePercentBp("-5")).toThrow(RangeError);
    expect(() => parsePercentBp("abc")).toThrow(RangeError);
    expect(formatPercentBp(2550)).toBe("25.5%");
    expect(formatPercentBp(2500)).toBe("25%");
    expect(formatPercentBp(725)).toBe("7.25%");
    expect(formatPercentBp(0)).toBe("0%");
    expect(formatPercentBp(1000)).toBe("10%");
  });
});
