"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkbox, optionalEmail, optionalId, optionalPhone, optionalPostal, optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit, changedFields } from "@/server/audit";
import { nextNumber } from "@/server/numbering";
import { ActionError, authorizedFormAction } from "./authorized-action";

const customerFields = {
  name: requiredText("Name", 200),
  categoryId: requiredId("Category"),
  phone: optionalPhone,
  email: optionalEmail,
  website: optionalText(200),
  billingStreet: optionalText(200),
  billingCity: optionalText(100),
  billingProvince: optionalText(2),
  billingPostal: optionalPostal,
  paymentTermId: optionalId,
  taxLevelId: optionalId,
  taxExemptNumber: optionalText(60),
  creditHold: checkbox,
  notes: optionalText(5000),
};

type CustomerInput = z.infer<z.ZodObject<typeof customerFields>>;

/** An exempt tax level needs the exemption certificate/licence number on file. */
async function checkTaxExemption(input: CustomerInput) {
  if (!input.taxLevelId) return;
  const level = await db.taxLevel.findUnique({ where: { id: input.taxLevelId }, select: { code: true } });
  if (level?.code === "EXEMPT" && !input.taxExemptNumber) {
    throw new ActionError("Enter the customer's tax exemption number for an exempt tax level.");
  }
}

export const createCustomer = authorizedFormAction("customers:write", z.object(customerFields), async (input, user) => {
  await checkTaxExemption(input);
  const customer = await db.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: { ...input, accountNumber: await nextNumber(tx, "CUSTOMER") } });
    await audit(tx, user.id, "create", "Customer", created.id, input);
    return created;
  });
  revalidatePath("/customers");
  return { redirectTo: `/customers/${customer.id}` };
});

export const updateCustomer = authorizedFormAction("customers:write", z.object({ id: requiredId("Customer"), ...customerFields }), async ({ id, ...input }, user) => {
  await checkTaxExemption(input);
  const before = await db.customer.findUnique({ where: { id } });
  if (!before) throw new ActionError("That customer no longer exists.");
  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id }, data: input });
    await audit(tx, user.id, "update", "Customer", id, changedFields(before, input));
  });
  revalidatePath(`/customers/${id}`);
  return { redirectTo: `/customers/${id}` };
});

export const setCustomerActive = authorizedFormAction("customers:write", z.object({ id: requiredId("Customer"), active: checkbox }), async ({ id, active }, user) => {
  await db.customer.update({ where: { id }, data: { active } });
  await audit(db, user.id, active ? "reactivate" : "deactivate", "Customer", id);
  revalidatePath(`/customers/${id}`);
  return { message: active ? "Customer reactivated." : "Customer deactivated. They're hidden from lists but their history is kept." };
});

/** Hard delete, administrators only, and only for customers nothing refers to (e.g. created by mistake). */
export const deleteCustomer = authorizedFormAction("customers:delete", z.object({ id: requiredId("Customer") }), async ({ id }, user) => {
  const c = await db.customer.findUnique({
    where: { id },
    select: { name: true, _count: { select: { jobSites: true, workOrders: true, quotes: true, invoices: true, projects: true, serviceAgreements: true } } },
  });
  if (!c) throw new ActionError("That customer no longer exists.");
  const used = Object.values(c._count).some((n) => n > 0);
  if (used) throw new ActionError("This customer has job sites, work orders or billing history, so it can't be deleted. Deactivate it instead.");
  await db.$transaction(async (tx) => {
    await tx.contact.deleteMany({ where: { customerId: id } });
    await tx.customer.delete({ where: { id } });
    await audit(tx, user.id, "delete", "Customer", id, { name: c.name });
  });
  revalidatePath("/customers");
  return { redirectTo: "/customers" };
});

// --- Contacts ---------------------------------------------------------------

const contactFields = {
  customerId: requiredId("Customer"),
  jobSiteId: optionalId,
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  title: optionalText(100),
  phone: optionalPhone,
  mobile: optionalPhone,
  email: optionalEmail,
  isPrimary: checkbox,
};

/** Create (no id) or update (id) a contact. Marking one primary un-marks the customer's others. */
export const saveContact = authorizedFormAction("customers:write", z.object({ id: optionalId, ...contactFields }), async ({ id, ...input }, user) => {
  if (input.jobSiteId) {
    const site = await db.jobSite.findUnique({ where: { id: input.jobSiteId }, select: { customerId: true } });
    if (site?.customerId !== input.customerId) throw new ActionError("That job site belongs to a different customer.");
  }
  await db.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { customerId: input.customerId, isPrimary: true, ...(id ? { NOT: { id } } : {}) }, data: { isPrimary: false } });
    }
    if (id) {
      const existing = await tx.contact.findUnique({ where: { id }, select: { customerId: true } });
      if (existing?.customerId !== input.customerId) throw new ActionError("That contact belongs to a different customer.");
      await tx.contact.update({ where: { id }, data: input });
      await audit(tx, user.id, "update", "Contact", id, input);
    } else {
      const created = await tx.contact.create({ data: input });
      await audit(tx, user.id, "create", "Contact", created.id, input);
    }
  });
  revalidatePath(`/customers/${input.customerId}`);
  return { message: id ? "Contact updated." : "Contact added." };
});

export const deleteContact = authorizedFormAction("customers:write", z.object({ id: requiredId("Contact") }), async ({ id }, user) => {
  const contact = await db.contact.findUnique({ where: { id }, select: { customerId: true, firstName: true, lastName: true } });
  if (!contact) throw new ActionError("That contact no longer exists.");
  await db.contact.delete({ where: { id } });
  await audit(db, user.id, "delete", "Contact", id, { name: `${contact.firstName} ${contact.lastName}` });
  revalidatePath(`/customers/${contact.customerId}`);
  return { message: "Contact removed." };
});
