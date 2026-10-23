// Zod helpers for form input. Forms post strings; these trim, normalize and convert them.
// Pure (no server imports) so forms and tests can use them too.

import { z } from "zod";
import { parseCents } from "./money";
import { parsePercentBp } from "./markup";

/** FormData → plain object. Repeated keys become arrays; unchecked checkboxes are simply absent. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue; // Next.js internals
    const v = typeof value === "string" ? value : value.name;
    if (key in out) out[key] = ([] as unknown[]).concat(out[key], v);
    else out[key] = v;
  }
  return out;
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const optionalText = (max = 500) =>
  z.preprocess(blankToNull, z.string().trim().max(max, "Too long").nullable().optional()).transform((v) => v ?? null);

export const optionalEmail = z
  .preprocess(blankToNull, z.string().trim().toLowerCase().email("Enter a valid email").nullable().optional())
  .transform((v) => v ?? null);

/** 10-digit North American numbers become (306) 555-0100; anything else (extensions, intl) is kept as typed. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10 && !/[a-wyz]/i.test(trimmed)) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return trimmed;
}

export const optionalPhone = z
  .preprocess(blankToNull, z.string().trim().max(40, "Too long").nullable().optional())
  .transform((v) => (v ? normalizePhone(v) : null));

const POSTAL = /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)$/;

/** Canadian postal code, normalized to "S4P 3Y2". */
export function normalizePostal(input: string): string | null {
  const m = POSTAL.exec(input.trim().toUpperCase());
  return m ? `${m[1]} ${m[2]}` : null;
}

export const optionalPostal = z
  .preprocess(blankToNull, z.string().nullable().optional())
  .superRefine((v, ctx) => {
    if (v && !normalizePostal(v)) ctx.addIssue({ code: "custom", message: "Enter a postal code like S4P 3Y2" });
  })
  .transform((v) => (v ? normalizePostal(v) : null));

/** HTML checkbox: present ("on"/"true") = true, absent = false. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const optionalId = z.preprocess(blankToNull, z.string().min(1).nullable().optional()).transform((v) => v ?? null);
export const requiredId = (label: string) => z.string({ error: `Choose a ${label.toLowerCase()}` }).min(1, `Choose a ${label.toLowerCase()}`);

/** "$1,234.56" → 123456 cents. */
export const money = (label: string, { min = 0 }: { min?: number } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string({ error: `${label} is required` })
      .min(1, `${label} is required`)
      .transform((v, ctx) => {
        try {
          const cents = parseCents(v);
          if (cents < min) ctx.addIssue({ code: "custom", message: `${label} can't be negative` });
          return cents;
        } catch {
          ctx.addIssue({ code: "custom", message: `${label} must be an amount like 125.00` });
          return z.NEVER;
        }
      }),
  );

/** "25" / "25.5%" → basis points. */
export const percent = (label: string, { max = 100_000 }: { max?: number } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string({ error: `${label} is required` })
      .min(1, `${label} is required`)
      .transform((v, ctx) => {
        try {
          const bp = parsePercentBp(v);
          if (bp > max) ctx.addIssue({ code: "custom", message: `${label} is too high` });
          return bp;
        } catch {
          ctx.addIssue({ code: "custom", message: `${label} must be a percentage like 5 or 7.5` });
          return z.NEVER;
        }
      }),
  );

export const wholeNumber = (label: string, { min = 0, max = 1_000_000 }: { min?: number; max?: number } = {}) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min).max(max);

export type FieldErrors = Record<string, string>;

/** Zod issues → first message per field, for showing next to inputs. */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
