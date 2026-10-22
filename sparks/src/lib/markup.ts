// Suggested material markup by job size. See docs/SPEC.md §5 (Inventory and pricing).
//
// Job size = the document's total material cost. The tier with the highest threshold that the
// cost reaches supplies the starting markup; users can change it on every quote/invoice.

import { lineAmountCents, type PriceUnit } from "./money";

export interface MarkupTierInput {
  minMaterialCostCents: number;
  markupBp: number;
}

export const MAX_MARKUP_BP = 100_000; // 1000%

/** Sorted ascending by threshold. */
export function sortTiers<T extends MarkupTierInput>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.minMaterialCostCents - b.minMaterialCostCents);
}

/** Starting markup for a job with this much material cost, or null when no tiers are set up. */
export function suggestMarkupBp(materialCostCents: number, tiers: MarkupTierInput[]): number | null {
  let match: MarkupTierInput | null = null;
  for (const tier of sortTiers(tiers)) {
    if (materialCostCents >= tier.minMaterialCostCents) match = tier;
  }
  return match?.markupBp ?? sortTiers(tiers)[0]?.markupBp ?? null;
}

/** Problems with a set of tiers, as messages for the user. Empty = valid. */
export function validateTiers(tiers: MarkupTierInput[]): string[] {
  const errors: string[] = [];
  if (tiers.length === 0) return ["Add at least one tier."];
  const sorted = sortTiers(tiers);
  if (sorted[0].minMaterialCostCents !== 0) errors.push("The first tier must start at $0 so every job gets a suggestion.");
  for (const t of tiers) {
    if (!Number.isSafeInteger(t.minMaterialCostCents) || t.minMaterialCostCents < 0) errors.push("Thresholds must be $0 or more.");
    if (!Number.isSafeInteger(t.markupBp) || t.markupBp < 0 || t.markupBp > MAX_MARKUP_BP) errors.push("Markups must be between 0% and 1000%.");
  }
  const thresholds = tiers.map((t) => t.minMaterialCostCents);
  if (new Set(thresholds).size !== thresholds.length) errors.push("Two tiers can't start at the same amount.");
  return [...new Set(errors)];
}

/** Total material cost of a document's lines (non-material lines are ignored). */
export function materialCostCents(lines: { kind: string; quantity: string | number; unitCostCents: number; priceUnit?: PriceUnit }[]): number {
  return lines
    .filter((l) => l.kind === "MATERIAL")
    .reduce((sum, l) => sum + lineAmountCents(String(l.quantity), l.unitCostCents, l.priceUnit ?? "E"), 0);
}

/** "25" / "25.5" / "25%" → basis points (2500 / 2550). Up to two decimals. */
export function parsePercentBp(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/%$/, "").trim());
  if (!match) throw new RangeError(`Invalid percentage: ${text}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 2550 → "25.5%" */
export function formatPercentBp(bp: number): string {
  return `${Number((bp / 100).toFixed(2))}%`;
}
