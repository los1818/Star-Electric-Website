import { describe, expect, it } from "vitest";
import { contractSummary, holdbackReleaseTotals, progressInvoiceTotals, progressLine } from "@/lib/progress-billing";
import type { TaxComponentRate } from "@/lib/money";

const GST: TaxComponentRate = { code: "GST", label: "GST", rateBp: 500 };
const PST: TaxComponentRate = { code: "PST", label: "PST", rateBp: 600 };

describe("contractSummary", () => {
  it("adds approved change orders to the contract and reports pending ones separately", () => {
    expect(
      contractSummary(25_000_000, [
        { amountCents: 1_250_000, approved: true },
        { amountCents: -300_000, approved: true }, // credit
        { amountCents: 800_000, approved: false },
      ]),
    ).toEqual({
      originalContractCents: 25_000_000,
      approvedChangeOrdersCents: 950_000,
      pendingChangeOrdersCents: 800_000,
      revisedContractCents: 25_950_000,
    });
  });
});

describe("progressLine", () => {
  it("bills percent complete to date less previous billing", () => {
    expect(progressLine({ scheduledValueCents: 4_000_000, percentCompleteBp: 6500, previouslyBilledCents: 1_000_000 })).toEqual({
      billedToDateCents: 2_600_000,
      thisPeriodCents: 1_600_000,
      balanceToFinishCents: 1_400_000,
    });
  });
  it("allows a negative correction when percent complete goes down", () => {
    expect(progressLine({ scheduledValueCents: 100_000, percentCompleteBp: 4000, previouslyBilledCents: 50_000 }).thisPeriodCents).toBe(-10_000);
  });
  it("rejects percentages outside 0–100%", () => {
    expect(() => progressLine({ scheduledValueCents: 1, percentCompleteBp: 10_001, previouslyBilledCents: 0 })).toThrow(RangeError);
    expect(() => progressLine({ scheduledValueCents: 1, percentCompleteBp: -1, previouslyBilledCents: 0 })).toThrow(RangeError);
  });
});

describe("progressInvoiceTotals", () => {
  it("retains 10% holdback and taxes only the amount due now", () => {
    const t = progressInvoiceTotals(
      [
        { scheduledValueCents: 4_000_000, percentCompleteBp: 5000, previouslyBilledCents: 1_000_000 }, // 1,000,000 this period
        { scheduledValueCents: 2_000_000, percentCompleteBp: 2500, previouslyBilledCents: 0 }, // 500,000
      ],
      1000,
      [GST, PST],
    );
    expect(t.workThisPeriodCents).toBe(1_500_000);
    expect(t.holdbackCents).toBe(150_000);
    expect(t.netBeforeTaxCents).toBe(1_350_000);
    expect(t.totals.taxCents).toBe(67_500 + 81_000);
    expect(t.amountDueCents).toBe(1_350_000 + 148_500);
  });

  it("works with no holdback", () => {
    const t = progressInvoiceTotals([{ scheduledValueCents: 100_000, percentCompleteBp: 10_000, previouslyBilledCents: 0 }], 0, [GST]);
    expect(t.holdbackCents).toBe(0);
    expect(t.amountDueCents).toBe(105_000);
  });

  it("rejects impossible holdback rates", () => {
    expect(() => progressInvoiceTotals([], 10_001, [GST])).toThrow(RangeError);
  });
});

describe("holdbackReleaseTotals", () => {
  it("bills the retained holdback with its tax", () => {
    const t = holdbackReleaseTotals(150_000, [GST, PST]);
    expect(t.taxCents).toBe(7_500 + 9_000);
    expect(t.totalCents).toBe(166_500);
  });
});
