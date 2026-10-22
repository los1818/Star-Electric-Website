import { describe, expect, it } from "vitest";
import { guessCategory, guessUnit, normalizeDescription, parseAccubidRows, skuFor } from "../../scripts/import-accubid-inventory/parse";

// Synthetic rows in the Trimble Accubid "Ext" layout. Prices are invented.
function row(description: string, quantity: number | null, tradePrice: number, unit: "E" | "C" | "M", total: number, extra: Record<string, unknown> = {}) {
  return {
    Description: description,
    Quantity: quantity,
    Date: new Date("2026-01-15"),
    "Trade Price": tradePrice,
    "Price Unit": unit,
    "Disc %": 0,
    "Net Cost": tradePrice,
    "DB Labor": 2.5,
    "Labor Unit": unit,
    "Total Material": total,
    "Labor Condition": "Normal",
    ...extra,
  };
}

const today = new Date("2026-10-22");

describe("parseAccubidRows", () => {
  it("parses per-C, per-M and per-each items and reconciles to the Totals row", () => {
    const result = parseAccubidRows(
      [
        row('    1" EMT', 500, 150, "C", 750),
        row("#8x    1\" WOOD SCREW", 2000, 40, "M", 80),
        row("20A 1P BREAKER", 3, 12.5, "E", 37.5),
        { Description: "Totals", "Total Material": 867.5 },
      ],
      today,
    );
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ description: '1" EMT', quantity: 500, priceUnit: "C", costCents: 15000, valueCents: 75000, unitCode: "FT", categoryCode: "CONDUIT" });
    expect(result.items[1]).toMatchObject({ description: '#8x 1" WOOD SCREW', priceUnit: "M", valueCents: 8000, categoryCode: "FASTENERS" });
    expect(result.items[2]).toMatchObject({ priceUnit: "E", costCents: 1250, valueCents: 3750, categoryCode: "BREAKERS" });
    expect(result.sheetTotalCents).toBe(86750);
    expect(result.importedTotalCents).toBe(86750);
    expect(result.issues).toEqual([]);
  });

  it("infers a blank quantity when the line value divides out exactly", () => {
    const result = parseAccubidRows([row('1/2" EMT', null, 50, "C", 555)], today);
    expect(result.items[0].quantity).toBe(1110);
    expect(result.issues.map((i) => i.kind)).toEqual(["QTY_INFERRED"]);
  });

  it("flags a value that doesn't match quantity × cost", () => {
    const result = parseAccubidRows([row("3/4\" CONN", 6, 180, "C", 0)], today);
    expect(result.issues.map((i) => i.kind)).toContain("VALUE_MISMATCH");
  });

  it("merges duplicate descriptions with summed stock and weighted-average cost", () => {
    const result = parseAccubidRows([row("20A 1P BREAKER", 2, 10, "E", 20), row("  20A  1P BREAKER", 6, 20, "E", 120)], today);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ quantity: 8, costCents: 1750, valueCents: 14000 });
    expect(result.issues[0].kind).toBe("DUPLICATE_MERGED");
  });

  it("flags stale prices, zero stock, and skips rows with unknown units", () => {
    const result = parseAccubidRows(
      [row("OLD ITEM", 1, 10, "E", 10, { Date: new Date("2019-05-01") }), row("EMPTY BIN", 0, 10, "E", 0), row("WEIRD", 1, 10, "X" as "E", 10)],
      today,
    );
    expect(result.issues.map((i) => i.kind).sort()).toEqual(["BAD_ROW", "STALE_PRICE", "ZERO_STOCK"]);
    expect(result.items.map((i) => i.description)).toEqual(["OLD ITEM", "EMPTY BIN"]);
  });

  it("reads labour units and the No Labor condition", () => {
    const result = parseAccubidRows([row('1/2" EMT DC SS CPLG', 10, 40, "C", 4, { "DB Labor": 0, "Labor Condition": "No Labor", "Labor Unit": "C" })], today);
    expect(result.items[0]).toMatchObject({ noLabor: true, laborHours: null, laborUnit: "C" });
  });

  it("flags when the Totals row doesn't reconcile", () => {
    const result = parseAccubidRows([row("A", 1, 10, "E", 10), { Description: "Totals", "Total Material": 500 }], today);
    expect(result.issues.map((i) => i.kind)).toContain("TOTALS_MISMATCH");
  });
});

describe("helpers", () => {
  it("normalizes Accubid alignment padding", () => {
    expect(normalizeDescription('  1/2"   K.O.FILLER ')).toBe('1/2" K.O.FILLER');
  });

  it("makes stable SKUs regardless of case", () => {
    expect(skuFor('1" EMT')).toBe(skuFor('1" emt'));
    expect(skuFor('1" EMT')).toMatch(/^TRM-[0-9A-F]{8}$/);
  });

  it.each([
    ['4x2 1/8" SQ BOX COMBKO', "BOXES"],
    ['6x 6x 4"-SCREW CVR D-BOX NEMA1', "BOXES"],
    ["#12 RW90 SOLID", "WIRE"],
    ['3/4" CABLE SUPPORT - CAT12', "FASTENERS"],
    ["#31 MARRETTE CONNECT", "MISC"],
    ["15A 125V GFI DUP REC (SG)", "DEVICES"],
    ["1G S/S BLANK PLATE STRAP MT", "DEVICES"],
    ["4/32W T8 BALLAST 347V", "LIGHTING"],
    ['1/2" EMT DC SS CONN', "CONDUIT"],
    ["SOMETHING UNKNOWN", "MISC"],
  ])("categorizes %s as %s", (description, category) => {
    expect(guessCategory(description)).toBe(category);
  });

  it("counts conduit and wire in feet, fittings in each", () => {
    expect(guessUnit('2" PVC', "CONDUIT", "C")).toBe("FT");
    expect(guessUnit('2" PVC COUPLING', "CONDUIT", "C")).toBe("EA");
    expect(guessUnit("#12 RW90 SOLID", "WIRE", "M")).toBe("FT");
    expect(guessUnit("BREAKER", "BREAKERS", "E")).toBe("EA");
  });
});
