import { describe, expect, it } from "vitest";
import { formatTime, reginaDate, reginaDayRange, reginaTime } from "@/lib/time";

describe("Regina time (UTC−6 all year)", () => {
  it("maps wall-clock times to instants and back, summer and winter alike", () => {
    expect(reginaTime(2026, 6, 15, 7).toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(reginaTime(2026, 0, 15, 7).toISOString()).toBe("2026-01-15T13:00:00.000Z");
    expect(formatTime(reginaTime(2026, 6, 15, 7, 30))).toMatch(/7:30\s?a\.m\./);
  });

  it("uses the Regina calendar day, not UTC's", () => {
    // 03:00 UTC on Oct 23 is still Oct 22 in Regina.
    expect(reginaDate(new Date("2026-10-23T03:00:00Z"))).toEqual({ year: 2026, month: 9, day: 22 });
    const { start, end } = reginaDayRange(new Date("2026-10-23T03:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-22T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-23T06:00:00.000Z");
  });

  it("handles month ends when offsetting days", () => {
    expect(reginaDayRange(new Date("2026-10-31T18:00:00Z"), 1).start.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
});

describe("form date/time inputs", () => {
  it("reads datetime-local values as Regina time and writes them back", async () => {
    const { parseReginaDateTimeLocal, toReginaDateTimeLocal } = await import("@/lib/time");
    const d = parseReginaDateTimeLocal("2026-10-24T08:30")!;
    expect(d.toISOString()).toBe("2026-10-24T14:30:00.000Z");
    expect(toReginaDateTimeLocal(d)).toBe("2026-10-24T08:30");
    expect(parseReginaDateTimeLocal("2026-13-01T08:00")).toBeNull();
    expect(parseReginaDateTimeLocal("tomorrow")).toBeNull();
  });
  it("parses date-only values strictly", async () => {
    const { parseDateOnly } = await import("@/lib/time");
    expect(parseDateOnly("2026-10-24")?.toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("24/10/2026")).toBeNull();
  });
});
