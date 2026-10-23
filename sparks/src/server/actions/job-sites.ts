"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkbox, optionalId, optionalPostal, optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit, changedFields } from "@/server/audit";
import { ActionError, authorizedFormAction } from "./authorized-action";

const siteFields = {
  customerId: requiredId("Customer"),
  name: requiredText("Site name", 200),
  street: requiredText("Street", 200),
  city: requiredText("City", 100),
  province: requiredText("Province", 2),
  postal: optionalPostal,
  accessNotes: optionalText(5000),
  taxLevelId: optionalId,
};

export const createJobSite = authorizedFormAction("jobsites:write", z.object(siteFields), async (input, user) => {
  const customer = await db.customer.findUnique({ where: { id: input.customerId }, select: { active: true } });
  if (!customer) throw new ActionError("That customer no longer exists.");
  if (!customer.active) throw new ActionError("That customer is inactive. Reactivate it before adding sites.");
  const site = await db.$transaction(async (tx) => {
    const created = await tx.jobSite.create({ data: input });
    await audit(tx, user.id, "create", "JobSite", created.id, input);
    return created;
  });
  revalidatePath("/job-sites");
  revalidatePath(`/customers/${input.customerId}`);
  return { redirectTo: `/job-sites/${site.id}` };
});

export const updateJobSite = authorizedFormAction("jobsites:write", z.object({ id: requiredId("Job site"), ...siteFields }), async ({ id, ...input }, user) => {
  const before = await db.jobSite.findUnique({ where: { id }, include: { _count: { select: { workOrders: true, invoices: true } } } });
  if (!before) throw new ActionError("That job site no longer exists.");
  if (before.customerId !== input.customerId && (before._count.workOrders > 0 || before._count.invoices > 0)) {
    throw new ActionError("This site has work orders or invoices, so it can't be moved to another customer.");
  }
  await db.$transaction(async (tx) => {
    await tx.jobSite.update({ where: { id }, data: input });
    await audit(tx, user.id, "update", "JobSite", id, changedFields(before, input));
  });
  revalidatePath(`/job-sites/${id}`);
  return { redirectTo: `/job-sites/${id}` };
});

export const setJobSiteActive = authorizedFormAction("jobsites:write", z.object({ id: requiredId("Job site"), active: checkbox }), async ({ id, active }, user) => {
  await db.jobSite.update({ where: { id }, data: { active } });
  await audit(db, user.id, active ? "reactivate" : "deactivate", "JobSite", id);
  revalidatePath(`/job-sites/${id}`);
  return { message: active ? "Job site reactivated." : "Job site deactivated. History is kept." };
});

export const deleteJobSite = authorizedFormAction("jobsites:delete", z.object({ id: requiredId("Job site") }), async ({ id }, user) => {
  const s = await db.jobSite.findUnique({
    where: { id },
    select: { name: true, customerId: true, _count: { select: { workOrders: true, quotes: true, invoices: true, equipment: true, projects: true, serviceAgreements: true } } },
  });
  if (!s) throw new ActionError("That job site no longer exists.");
  if (Object.values(s._count).some((n) => n > 0)) {
    throw new ActionError("This site has work, equipment or billing history, so it can't be deleted. Deactivate it instead.");
  }
  await db.$transaction(async (tx) => {
    await tx.contact.updateMany({ where: { jobSiteId: id }, data: { jobSiteId: null } });
    await tx.jobSite.delete({ where: { id } });
    await audit(tx, user.id, "delete", "JobSite", id, { name: s.name });
  });
  revalidatePath("/job-sites");
  return { redirectTo: `/customers/${s.customerId}` };
});
