"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkbox, optionalEmail, optionalId, optionalPhone, optionalPostal, optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit, changedFields } from "@/server/audit";
import { nextNumber } from "@/server/numbering";
import { ActionError, authorizedFormAction } from "./authorized-action";

// --- Employees ----------------------------------------------------------------

const optionalDate = z
  .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2024-03-15").nullable().optional())
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const employeeFields = {
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  tradeId: optionalId,
  laborRateId: optionalId,
  phone: optionalPhone,
  email: optionalEmail,
  hireDate: optionalDate,
};

export const createEmployee = authorizedFormAction("employees:write", z.object(employeeFields), async (input, user) => {
  const employee = await db.$transaction(async (tx) => {
    const created = await tx.employee.create({ data: { ...input, employeeNumber: await nextNumber(tx, "EMPLOYEE") } });
    await audit(tx, user.id, "create", "Employee", created.id, input);
    return created;
  });
  revalidatePath("/employees");
  return { redirectTo: `/employees/${employee.id}` };
});

export const updateEmployee = authorizedFormAction("employees:write", z.object({ id: requiredId("Employee"), ...employeeFields }), async ({ id, ...input }, user) => {
  const before = await db.employee.findUnique({ where: { id } });
  if (!before) throw new ActionError("That employee no longer exists.");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: input });
    await audit(tx, user.id, "update", "Employee", id, changedFields(before, input));
  });
  revalidatePath(`/employees/${id}`);
  return { redirectTo: `/employees/${id}` };
});

/** Employees are never deleted (time and payroll history); deactivating hides them from schedules and pickers. */
export const setEmployeeActive = authorizedFormAction("employees:write", z.object({ id: requiredId("Employee"), active: checkbox }), async ({ id, active }, user) => {
  await db.employee.update({ where: { id }, data: { active } });
  await audit(db, user.id, active ? "reactivate" : "deactivate", "Employee", id);
  revalidatePath(`/employees/${id}`);
  return { message: active ? "Employee reactivated." : "Employee deactivated. Their time and history are kept." };
});

// --- Vendors ------------------------------------------------------------------

const vendorFields = {
  name: requiredText("Vendor name", 200),
  accountNumber: optionalText(60),
  contactName: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  street: optionalText(200),
  city: optionalText(100),
  province: optionalText(2),
  postal: optionalPostal,
};

export const createVendor = authorizedFormAction("vendors:write", z.object(vendorFields), async (input, user) => {
  const vendor = await db.$transaction(async (tx) => {
    const created = await tx.vendor.create({ data: input });
    await audit(tx, user.id, "create", "Vendor", created.id, input);
    return created;
  });
  revalidatePath("/vendors");
  return { redirectTo: `/vendors/${vendor.id}` };
});

export const updateVendor = authorizedFormAction("vendors:write", z.object({ id: requiredId("Vendor"), ...vendorFields }), async ({ id, ...input }, user) => {
  const before = await db.vendor.findUnique({ where: { id } });
  if (!before) throw new ActionError("That vendor no longer exists.");
  await db.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: input });
    await audit(tx, user.id, "update", "Vendor", id, changedFields(before, input));
  });
  revalidatePath(`/vendors/${id}`);
  return { redirectTo: `/vendors/${id}` };
});

export const setVendorActive = authorizedFormAction("vendors:write", z.object({ id: requiredId("Vendor"), active: checkbox }), async ({ id, active }, user) => {
  await db.vendor.update({ where: { id }, data: { active } });
  await audit(db, user.id, active ? "reactivate" : "deactivate", "Vendor", id);
  revalidatePath(`/vendors/${id}`);
  return { message: active ? "Vendor reactivated." : "Vendor deactivated. Purchase history is kept." };
});
