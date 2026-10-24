import { describe, expect, it } from "vitest";
import { addDays, entryState, hoursBetween, isValidDate, parseHoursHundredths, weekDays, weekStart } from "@/lib/timesheets";

describe("parseHoursHundredths", () => {
  it("accepts decimals and h:mm", () => {
    expect(parseHoursHundredths("7.5")).toBe(750);
    expect(parseHoursHundredths("7:30")).toBe(750);
    expect(parseHoursHundredths("8")).toBe(800);
    expect(parseHoursHundredths("0.25")).toBe(25);
    expect(parseHoursHundredths("0:20")).toBe(33); // 20 min = 0.333 h
    expect(parseHoursHundredths(" 10.75 ")).toBe(1075);
  });
  it("rejects junk", () => {
    for (const bad of ["", "abc", "7.555", "7:60", "-1", "1,5", "100"]) expect(() => parseHoursHundredths(bad)).toThrow(RangeError);
  });
});

describe("hoursBetween", () => {
  it("measures a shift, including past midnight", () => {
    expect(hoursBetween("07:00", "15:30")).toBe(850);
    expect(hoursBetween("22:00", "06:00")).toBe(800);
    expect(hoursBetween("08:00", "08:20")).toBe(33);
    expect(() => hoursBetween("25:00", "08:00")).toThrow(RangeError);
  });
});

describe("weeks", () => {
  it("finds Monday and lists the week", () => {
    expect(weekStart("2026-10-24")).toBe("2026-10-19"); // Saturday → Monday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the same week
    expect(weekDays("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("validates dates strictly", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
  });
  it("derives entry state", () => {
    expect(entryState({ submittedAt: null, approvedAt: null })).toBe("draft");
    expect(entryState({ submittedAt: new Date(), approvedAt: null })).toBe("submitted");
    expect(entryState({ submittedAt: new Date(), approvedAt: new Date() })).toBe("approved");
  });
});
