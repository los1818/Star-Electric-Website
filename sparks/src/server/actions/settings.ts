"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { LOOKUP_KEYS, lookupFields, normalizeCode, parseMultiplierBp, type LookupField, type LookupKey } from "@/lib/lookups";
import { checkbox, fieldErrorsFrom, money, optionalEmail, optionalId, optionalPhone, optionalPostal, optionalText, percent, requiredText, wholeNumber } from "@/lib/validation";
import { COMPANY_FIELDS } from "@/lib/company";
import { audit, changedFields } from "@/server/audit";
import { lookupDelegate } from "@/server/lookups";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const colorField = z
  .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #2563eb").nullable().optional())
  .transform((v) => v?.toLowerCase() ?? null);

const multiplierField = (label: string) =>
  z.string({ error: `${label} is required` }).transform((v, ctx) => {
    try {
      const bp = parseMultiplierBp(v);
      if (bp <= 0 || bp > 100_000) ctx.addIssue({ code: "custom", message: `${label} must be between 0 and 10` });
      return bp;
    } catch {
      ctx.addIssue({ code: "custom", message: `${label} must be a number like 1.5` });
      return z.NEVER;
    }
  });

function extraField(f: LookupField, table: LookupKey): z.ZodTypeAny {
  switch (f.type) {
    case "color":
      return colorField;
    case "boolean":
      return checkbox;
    case "percent":
      return percent(f.label, { max: table === "tax-components" ? 10_000 : 100_000 });
    case "multiplier":
      return multiplierField(f.label);
    case "money":
      return money(f.label);
    case "int":
      return wholeNumber(f.label, { min: 0, max: 3650 });
    case "text":
      return optionalText(100);
  }
}

function rowSchema(table: LookupKey, creating: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {
    label: requiredText("Label", 100),
    sortOrder: wholeNumber("Order", { max: 100_000 }),
    active: checkbox,
  };
  if (creating) {
    shape.code = requiredText("Code", 40).transform((v, ctx) => {
      const code = normalizeCode(v);
      if (!code) ctx.addIssue({ code: "custom", message: "Use letters and numbers, e.g. NET60" });
      return code;
    });
  }
  for (const f of lookupFields(table)) shape[f.name] = extraField(f, table);
  return z.object(shape);
}

const saveLookupRowSchema = z.object({ table: z.enum(LOOKUP_KEYS as [LookupKey, ...LookupKey[]]), id: optionalId }).loose();

/** Create (no id) or edit (id) a row in any Settings lookup table. Codes can't change after creation. */
export const saveLookupRow = authorizedFormAction("settings:manage", saveLookupRowSchema, async (raw, user) => {
  const { table, id } = raw;
  const parsed = rowSchema(table, !id).safeParse(raw);
  if (!parsed.success) throw new ValidationError(fieldErrorsFrom(parsed.error));
  const data = parsed.data as Record<string, unknown>;

  // Tax levels: component checkboxes and a single default.
  const componentIds = table === "tax-levels" ? ([] as string[]).concat((raw.components as string | string[] | undefined) ?? []) : null;
  if (table === "tax-levels" && data.isDefault && !data.active) throw new ActionError("The default tax level must be active.");

  const saved = await db.$transaction(async (tx) => {
    const delegate = lookupDelegate(table, tx);
    if (table === "tax-levels" && data.isDefault) {
      await tx.taxLevel.updateMany({ where: { isDefault: true, ...(id ? { NOT: { id } } : {}) }, data: { isDefault: false } });
    }
    let row;
    if (id) {
      const before = await delegate.findUnique({ where: { id } });
      if (!before) throw new ActionError("That row no longer exists.");
      row = await delegate.update({ where: { id }, data });
      await audit(tx, user.id, "update", `lookup:${table}`, id, changedFields(before, data));
    } else {
      row = await delegate.create({ data });
      await audit(tx, user.id, "create", `lookup:${table}`, row.id, data);
    }
    if (componentIds) {
      await tx.taxLevelComponent.deleteMany({ where: { taxLevelId: row.id } });
      if (componentIds.length) await tx.taxLevelComponent.createMany({ data: componentIds.map((taxComponentId) => ({ taxLevelId: row.id, taxComponentId })) });
    }
    return row;
  });
  revalidatePath(`/settings/${table}`);
  return { message: id ? `Saved “${saved.label}”.` : `Added “${saved.label}”.` };
});

// --- Company information ---------------------------------------------------------


const companySchema = z.object({
  companyName: requiredText("Company name", 200),
  companyStreet: optionalText(200),
  companyCity: optionalText(100),
  companyProvince: optionalText(2),
  companyPostal: optionalPostal,
  companyPhone: optionalPhone,
  companyEmail: optionalEmail,
  gstNumber: optionalText(40),
  pstNumber: optionalText(40),
  invoiceFooter: optionalText(1000),
});

export const saveCompanySettings = authorizedFormAction("settings:manage", companySchema, async (input, user) => {
  await db.$transaction(async (tx) => {
    for (const [field, key] of Object.entries(COMPANY_FIELDS)) {
      const value = input[field as keyof typeof input] ?? "";
      await tx.companySetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await audit(tx, user.id, "update", "CompanySetting", "company", input);
  });
  revalidatePath("/settings/company");
  return { message: "Company information saved." };
});
