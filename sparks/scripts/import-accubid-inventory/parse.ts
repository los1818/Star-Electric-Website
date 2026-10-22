import { createHash } from "node:crypto";
import { PRICE_UNIT_QUANTITY, lineAmountCents, netCostCents, parseCents, type PriceUnit } from "../../src/lib/money";

// Turns rows from a Trimble Accubid "Extension" (Ext) sheet into inventory items, and lists
// anything that looks wrong. Pure: no file or database access, so it can be unit-tested.
//
// Expected columns: Description, Quantity, Date, Trade Price, Price Unit, Disc %, Net Cost,
// DB Labor, Labor Unit, Total Material, Labor Condition. The last row is "Totals".

export type SheetRow = Record<string, unknown>;

export type IssueKind =
  | "QTY_INFERRED"
  | "QTY_MISSING"
  | "VALUE_MISMATCH"
  | "DUPLICATE_MERGED"
  | "STALE_PRICE"
  | "ZERO_STOCK"
  | "BAD_ROW"
  | "TOTALS_MISMATCH";

export interface Issue {
  kind: IssueKind;
  description: string;
  detail: string;
}

export interface ParsedItem {
  sku: string;
  description: string;
  categoryCode: string;
  unitCode: "FT" | "EA";
  quantity: number;
  priceUnit: PriceUnit;
  tradePriceCents: number;
  discountBp: number;
  costCents: number;
  priceDate: Date | null;
  laborHours: number | null;
  laborUnit: PriceUnit;
  noLabor: boolean;
  /** quantity × cost, in cents. */
  valueCents: number;
}

export interface ParseResult {
  items: ParsedItem[];
  issues: Issue[];
  sheetTotalCents: number | null;
  importedTotalCents: number;
}

const STALE_AFTER_YEARS = 3;

/** First matching rule wins, so more specific patterns come first. */
const CATEGORY_RULES: [string, RegExp][] = [
  // Specific exceptions to the broad rules below.
  ["MISC", /MARRETTE|\bGRD\b|TAPE|SEALANT/],
  ["BOXES", /D-BOX/],
  ["DEVICES", /PLATE STRAP|DECORA STRAP/],
  ["CONDUIT", /MALE BOX CONN|90DEG .*ELB/],
  ["FASTENERS", /CABLE SUPPORT|AIRCRAFT CABLE|STRUT CLAMP|BEAM CLAMP|HANGER W\/BOLT|STAPLE|GROMMET|KON CLIP|\bSTRAP\b|SCREW|ANCHOR|REDI-ROD|CHNL|S-HOOK|HEX NUT|WASHER \(PLT\)/],
  ["BOXES", /\bBOX\b|D-BOX|HANDIBOX|EXT RING|PL-RING|TILE RNG|BLANK COVER|SWTCH COV|RCPT COV|BOX BAR|F-CLIP|BRACKET|\bOCT\b/],
  ["BREAKERS", /BREAKER|BRKR|PANELFILLER|MOTOR SWITCH/],
  ["LIGHTING", /BALLAST|\bEXIT\b/],
  ["WIRE", /RW90|RWU90|\bTEW\b|BX CABLE|LVT|TWISTED CABLE|SHIELDED CABLE|AWM|CABLE \(STATION|CAT-6 CABLE/],
  ["DEVICES", /\bREC\b|\bSW\b|PLUG|CONN BODY|PLATE|JACK|SENSOR|\bLEV\b|PORT|PATCH|PACPOLE|WP .*COVER/],
  ["CONDUIT", /EMT|PVC|GRC|FLEX|\bLT\b|NIPPLE|BUSHING|COUPLING|RED WASHER|CONN|ELBOW|DUCT|COR-LINE|K\.O\.|CONDUIT/],
];

/** Collapse Accubid's alignment padding: "  1/2\"   K.O.FILLER" → "1/2\" K.O.FILLER". */
export function normalizeDescription(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function guessCategory(description: string): string {
  const upper = description.toUpperCase();
  return CATEGORY_RULES.find(([, re]) => re.test(upper))?.[0] ?? "MISC";
}

/** Conduit, wire and cable priced per C/M are counted in feet; everything else in each. */
export function guessUnit(description: string, categoryCode: string, priceUnit: PriceUnit): "FT" | "EA" {
  if (priceUnit === "E") return "EA";
  const upper = description.toUpperCase();
  if (categoryCode === "WIRE") return "FT";
  if (categoryCode === "CONDUIT" && /^[\d\s/"]+(EMT|PVC|ALUMINUM FLEX|LT FLEX|NM LT FLEX|PVC COR-LINE)$/.test(upper)) return "FT";
  return "EA";
}

export function skuFor(description: string): string {
  return `TRM-${createHash("sha1").update(description.toUpperCase()).digest("hex").slice(0, 8).toUpperCase()}`;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cents(value: unknown): number {
  const n = num(value);
  return n === null ? 0 : parseCents(n.toFixed(2));
}

function unit(value: unknown): PriceUnit | null {
  const u = String(value ?? "").trim().toUpperCase();
  return u === "E" || u === "C" || u === "M" ? u : null;
}

export function parseAccubidRows(rows: SheetRow[], today = new Date()): ParseResult {
  const issues: Issue[] = [];
  const byDescription = new Map<string, ParsedItem>();
  let sheetTotalCents: number | null = null;
  const staleBefore = new Date(today);
  staleBefore.setFullYear(staleBefore.getFullYear() - STALE_AFTER_YEARS);

  for (const row of rows) {
    const rawDescription = String(row["Description"] ?? "");
    const description = normalizeDescription(rawDescription);
    if (!description) continue;
    if (description.toLowerCase() === "totals") {
      sheetTotalCents = cents(row["Total Material"]);
      continue;
    }

    const priceUnit = unit(row["Price Unit"]);
    const tradePriceCents = cents(row["Trade Price"]);
    if (!priceUnit) {
      issues.push({ kind: "BAD_ROW", description, detail: `Unknown price unit "${String(row["Price Unit"])}"; skipped` });
      continue;
    }
    const discountBp = Math.round((num(row["Disc %"]) ?? 0) * 100);
    const costCents = num(row["Net Cost"]) !== null ? cents(row["Net Cost"]) : netCostCents(tradePriceCents, discountBp);
    const sheetValueCents = cents(row["Total Material"]);
    let quantity = num(row["Quantity"]) ?? 0;

    if (quantity === 0 && sheetValueCents > 0 && costCents > 0) {
      // Quantity blank but the line has a value: infer it if it divides out exactly.
      const inferred = (sheetValueCents * PRICE_UNIT_QUANTITY[priceUnit]) / costCents;
      if (Number.isInteger(inferred)) {
        quantity = inferred;
        issues.push({ kind: "QTY_INFERRED", description, detail: `Quantity blank; inferred ${inferred} from total value` });
      } else {
        issues.push({ kind: "QTY_MISSING", description, detail: "Quantity blank but the line has a value; imported as 0" });
      }
    }

    const valueCents = lineAmountCents(String(quantity), costCents, priceUnit);
    if (quantity > 0 && Math.abs(valueCents - sheetValueCents) > 1) {
      issues.push({
        kind: "VALUE_MISMATCH",
        description,
        detail: `Sheet total ${(sheetValueCents / 100).toFixed(2)} but quantity × cost = ${(valueCents / 100).toFixed(2)}`,
      });
    }
    if (quantity === 0) issues.push({ kind: "ZERO_STOCK", description, detail: "No stock on hand" });

    const date = row["Date"] instanceof Date ? (row["Date"] as Date) : null;
    if (date && date < staleBefore) {
      issues.push({ kind: "STALE_PRICE", description, detail: `Price last updated ${date.toISOString().slice(0, 10)}` });
    }

    const laborHours = num(row["DB Labor"]);
    const categoryCode = guessCategory(description);
    const item: ParsedItem = {
      sku: skuFor(description),
      description,
      categoryCode,
      unitCode: guessUnit(description, categoryCode, priceUnit),
      quantity,
      priceUnit,
      tradePriceCents,
      discountBp,
      costCents,
      priceDate: date,
      laborHours: laborHours && laborHours > 0 ? laborHours : null,
      laborUnit: unit(row["Labor Unit"]) ?? priceUnit,
      noLabor: String(row["Labor Condition"] ?? "").toLowerCase() === "no labor",
      valueCents,
    };

    const existing = byDescription.get(description.toUpperCase());
    if (!existing) {
      byDescription.set(description.toUpperCase(), item);
      continue;
    }
    // Same item listed twice (e.g. two purchase lots): one item, summed stock, weighted-average cost.
    if (existing.priceUnit !== item.priceUnit) {
      issues.push({ kind: "BAD_ROW", description, detail: "Listed twice with different price units; second row skipped" });
      continue;
    }
    const totalQty = existing.quantity + item.quantity;
    const totalValue = existing.valueCents + item.valueCents;
    const averageCost = totalQty > 0 ? Math.round((totalValue * PRICE_UNIT_QUANTITY[item.priceUnit]) / totalQty) : item.costCents;
    issues.push({
      kind: "DUPLICATE_MERGED",
      description,
      detail: `Listed twice (costs ${(existing.costCents / 100).toFixed(2)} and ${(item.costCents / 100).toFixed(2)} per ${item.priceUnit}); merged to ${totalQty} at average ${(averageCost / 100).toFixed(2)}`,
    });
    Object.assign(existing, {
      quantity: totalQty,
      costCents: averageCost,
      tradePriceCents: averageCost,
      valueCents: totalValue,
      priceDate: [existing.priceDate, item.priceDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    });
  }

  const items = [...byDescription.values()];
  const importedTotalCents = items.reduce((sum, i) => sum + i.valueCents, 0);
  if (sheetTotalCents !== null && Math.abs(sheetTotalCents - importedTotalCents) > 100) {
    issues.push({
      kind: "TOTALS_MISMATCH",
      description: "Totals",
      detail: `Sheet total ${(sheetTotalCents / 100).toFixed(2)} vs imported ${(importedTotalCents / 100).toFixed(2)}`,
    });
  }
  return { items, issues, sheetTotalCents, importedTotalCents };
}
