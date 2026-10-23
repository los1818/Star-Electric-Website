import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatDocumentNumber } from "@/lib/numbering";
import {
  checkbox,
  fieldErrorsFrom,
  formDataToObject,
  money,
  normalizePhone,
  normalizePostal,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalPostal,
  optionalText,
  percent,
  requiredText,
} from "@/lib/validation";

describe("normalizers", () => {
  it("formats North American phone numbers and keeps anything else as typed", () => {
    expect(normalizePhone("3065550100")).toBe("(306) 555-0100");
    expect(normalizePhone("1-306-555-0100")).toBe("(306) 555-0100");
    expect(normalizePhone("306.555.0100")).toBe("(306) 555-0100");
    expect(normalizePhone("306-555-0100 ext 12")).toBe("306-555-0100 ext 12");
  });

  it("normalizes Canadian postal codes and rejects invalid ones", () => {
    expect(normalizePostal("s4p3y2")).toBe("S4P 3Y2");
    expect(normalizePostal(" S4P 3Y2 ")).toBe("S4P 3Y2");
    expect(normalizePostal("D4P 3Y2")).toBeNull(); // D is never a first letter
    expect(normalizePostal("12345")).toBeNull();
  });

  it("formats document numbers", () => {
    expect(formatDocumentNumber("C", 1021, 5)).toBe("C01021");
    expect(formatDocumentNumber("WO-", 7, 6)).toBe("WO-000007");
    expect(() => formatDocumentNumber("X", 0, 3)).toThrow(RangeError);
  });
});

describe("form schemas", () => {
  const schema = z.object({
    name: requiredText("Name"),
    notes: optionalText(),
    email: optionalEmail,
    phone: optionalPhone,
    postal: optionalPostal,
    categoryId: optionalId,
    active: checkbox,
    cost: money("Cost"),
    rate: percent("Rate"),
  });

  it("trims, normalizes and turns blanks into null", () => {
    const parsed = schema.parse({ name: "  Acme  ", notes: "   ", email: " AP@Example.COM ", phone: "3065550100", postal: "s4n1a1", categoryId: "", active: "on", cost: "$1,234.50", rate: "5" });
    expect(parsed).toEqual({ name: "Acme", notes: null, email: "ap@example.com", phone: "(306) 555-0100", postal: "S4N 1A1", categoryId: null, active: true, cost: 123450, rate: 500 });
  });

  it("treats a missing checkbox as false and missing optionals as null", () => {
    const parsed = schema.parse({ name: "A", cost: "0", rate: "7.25" });
    expect(parsed).toMatchObject({ active: false, notes: null, email: null, phone: null, postal: null, categoryId: null, rate: 725 });
  });

  it("reports readable errors per field", () => {
    const result = schema.safeParse({ name: " ", email: "nope", postal: "12345", cost: "abc", rate: "lots" });
    expect(result.success).toBe(false);
    const errors = fieldErrorsFrom(result.error!);
    expect(errors.name).toBe("Name is required");
    expect(errors.email).toBe("Enter a valid email");
    expect(errors.postal).toBe("Enter a postal code like S4P 3Y2");
    expect(errors.cost).toBe("Cost must be an amount like 125.00");
    expect(errors.rate).toBe("Rate must be a percentage like 5 or 7.5");
  });

  it("rejects negative money unless allowed", () => {
    expect(money("Cost").safeParse("-5").success).toBe(false);
    expect(money("Amount", { min: -Infinity }).parse("-5")).toBe(-500);
  });
});

describe("formDataToObject", () => {
  it("collects repeated keys and skips Next internals", () => {
    const fd = new FormData();
    fd.append("name", "A");
    fd.append("tag", "x");
    fd.append("tag", "y");
    fd.append("$ACTION_ID_abc", "");
    expect(formDataToObject(fd)).toEqual({ name: "A", tag: ["x", "y"] });
  });
});
