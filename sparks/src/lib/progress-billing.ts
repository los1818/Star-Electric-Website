// Project progress billing and holdback. See docs/SPEC.md §5 (Projects).
//
// - A progress invoice bills each schedule-of-values line up to its percent complete to date,
//   less what was billed before.
// - Holdback (SK Builders' Lien Act: 10% by default) is retained from the work billed this period.
// - Tax is charged on the amount due now (work less holdback); tax on holdback is charged when the
//   holdback is released. [ASSUMPTION: confirm with Star Electric's accountant]

import { applyRateBp, computeTotals, type DocumentTotals, type TaxComponentRate } from "./money";

export interface ContractSummary {
  originalContractCents: number;
  approvedChangeOrdersCents: number;
  pendingChangeOrdersCents: number;
  revisedContractCents: number;
}

export function contractSummary(
  originalContractCents: number,
  changeOrders: { amountCents: number; approved: boolean }[],
): ContractSummary {
  const approved = changeOrders.filter((c) => c.approved).reduce((s, c) => s + c.amountCents, 0);
  const pending = changeOrders.filter((c) => !c.approved).reduce((s, c) => s + c.amountCents, 0);
  return {
    originalContractCents,
    approvedChangeOrdersCents: approved,
    pendingChangeOrdersCents: pending,
    revisedContractCents: originalContractCents + approved,
  };
}

export interface ProgressLineInput {
  scheduledValueCents: number;
  /** Percent complete to date, basis points (0–10000). */
  percentCompleteBp: number;
  previouslyBilledCents: number;
}

export interface ProgressLineResult {
  billedToDateCents: number;
  thisPeriodCents: number;
  balanceToFinishCents: number;
}

export function progressLine({ scheduledValueCents, percentCompleteBp, previouslyBilledCents }: ProgressLineInput): ProgressLineResult {
  if (!Number.isSafeInteger(percentCompleteBp) || percentCompleteBp < 0 || percentCompleteBp > 10_000) {
    throw new RangeError("Percent complete must be between 0% and 100%");
  }
  const billedToDateCents = applyRateBp(scheduledValueCents, percentCompleteBp);
  return {
    billedToDateCents,
    // Negative if percent complete was reduced: a correction this period.
    thisPeriodCents: billedToDateCents - previouslyBilledCents,
    balanceToFinishCents: scheduledValueCents - billedToDateCents,
  };
}

export interface ProgressInvoiceTotals {
  workThisPeriodCents: number;
  holdbackCents: number;
  /** Work less holdback: what tax applies to and what is due now, before tax. */
  netBeforeTaxCents: number;
  totals: DocumentTotals;
  /** Amount due now including tax. */
  amountDueCents: number;
}

export function progressInvoiceTotals(
  lines: ProgressLineInput[],
  holdbackBp: number,
  taxComponents: TaxComponentRate[],
): ProgressInvoiceTotals {
  if (holdbackBp < 0 || holdbackBp > 10_000) throw new RangeError("Holdback must be between 0% and 100%");
  const workThisPeriodCents = lines.reduce((sum, l) => sum + progressLine(l).thisPeriodCents, 0);
  const holdbackCents = applyRateBp(workThisPeriodCents, holdbackBp);
  const netBeforeTaxCents = workThisPeriodCents - holdbackCents;
  const totals = computeTotals([{ amountCents: netBeforeTaxCents, taxComponents }]);
  return { workThisPeriodCents, holdbackCents, netBeforeTaxCents, totals, amountDueCents: totals.totalCents };
}

/** Releasing holdback: the retained amount is billed now, with its tax. */
export function holdbackReleaseTotals(heldCents: number, taxComponents: TaxComponentRate[]): DocumentTotals {
  return computeTotals([{ amountCents: heldCents, taxComponents }]);
}
