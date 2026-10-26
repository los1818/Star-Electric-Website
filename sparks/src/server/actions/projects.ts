"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkbox, money, optionalDateOnly, optionalId, optionalText, percent, requiredId, requiredText, wholeNumber } from "@/lib/validation";
import { audit, changedFields } from "@/server/audit";
import { nextJobNumber, nextNumber } from "@/server/numbering";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const projectFields = {
  name: requiredText("Project name", 200),
  customerId: requiredId("Customer"),
  jobSiteId: optionalId,
  statusId: requiredId("Status"),
  managerId: optionalId,
  taxLevelId: optionalId,
  contractNumber: optionalText(60),
  customerPoNumber: optionalText(60),
  originalContractCents: money("Contract value"),
  holdbackBp: percent("Holdback", { max: 10_000 }),
  startDate: optionalDateOnly("Start date"),
  substantialCompletion: optionalDateOnly("Substantial completion"),
  notes: optionalText(10_000),
};

type ProjectInput = z.infer<z.ZodObject<typeof projectFields>>;

async function checkProject(input: ProjectInput) {
  if (!input.jobSiteId) return;
  const site = await db.jobSite.findUnique({ where: { id: input.jobSiteId }, select: { customerId: true } });
  if (site?.customerId !== input.customerId) throw new ValidationError({ jobSiteId: "Choose a job site for this customer" });
}

export const createProject = authorizedFormAction("projects:write", z.object(projectFields), async (input, user) => {
  await checkProject(input);
  const project = await db.$transaction(async (tx) => {
    const created = await tx.project.create({ data: { ...input, number: await nextNumber(tx, "PROJECT"), jobNumber: await nextJobNumber(tx) } });
    await audit(tx, user.id, "create", "Project", created.id, input);
    return created;
  });
  revalidatePath("/projects");
  return { redirectTo: `/projects/${project.id}` };
});

export const updateProject = authorizedFormAction("projects:write", z.object({ id: requiredId("Project"), ...projectFields }), async ({ id, ...input }, user) => {
  await checkProject(input);
  const before = await db.project.findUnique({ where: { id }, include: { _count: { select: { invoices: true } } } });
  if (!before) throw new ActionError("That project no longer exists.");
  if (before._count.invoices > 0 && before.customerId !== input.customerId) throw new ActionError("This project has invoices, so its customer can't change.");
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: input });
    await audit(tx, user.id, "update", "Project", id, changedFields(before, input));
  });
  revalidatePath(`/projects/${id}`);
  return { redirectTo: `/projects/${id}` };
});

// --- Schedule of values ---------------------------------------------------------

export const saveSovLine = authorizedFormAction(
  "projects:write",
  z.object({ id: optionalId, projectId: requiredId("Project"), description: requiredText("Description", 300), scheduledValueCents: money("Scheduled value"), sortOrder: wholeNumber("Order") }),
  async ({ id, projectId, ...data }, user) => {
    if (id) {
      const line = await db.scheduleOfValuesLine.findUnique({ where: { id }, include: { _count: { select: { progressLines: true } } } });
      if (!line || line.projectId !== projectId) throw new ActionError("That line no longer exists.");
      if (line._count.progressLines > 0 && line.scheduledValueCents !== data.scheduledValueCents) {
        throw new ActionError("This line has been billed, so its value can't change. Use a change order instead.");
      }
      await db.scheduleOfValuesLine.update({ where: { id }, data });
      await audit(db, user.id, "update", "ScheduleOfValuesLine", id, data);
    } else {
      const created = await db.scheduleOfValuesLine.create({ data: { projectId, ...data } });
      await audit(db, user.id, "create", "ScheduleOfValuesLine", created.id, data);
    }
    revalidatePath(`/projects/${projectId}`);
    return { message: id ? "Line saved." : "Line added." };
  },
);

export const deleteSovLine = authorizedFormAction("projects:write", z.object({ id: requiredId("Line") }), async ({ id }, user) => {
  const line = await db.scheduleOfValuesLine.findUnique({ where: { id }, include: { _count: { select: { progressLines: true } } } });
  if (!line) throw new ActionError("That line no longer exists.");
  if (line._count.progressLines > 0) throw new ActionError("This line has been billed, so it can't be removed.");
  await db.scheduleOfValuesLine.delete({ where: { id } });
  await audit(db, user.id, "delete", "ScheduleOfValuesLine", id, { description: line.description });
  revalidatePath(`/projects/${line.projectId}`);
  return { message: "Line removed." };
});

// --- Change orders ---------------------------------------------------------------

export const createChangeOrder = authorizedFormAction(
  "projects:write",
  z.object({
    projectId: requiredId("Project"),
    title: requiredText("Title", 200),
    description: optionalText(10_000),
    amountCents: money("Amount", { min: -Infinity }),
    customerReference: optionalText(60),
  }),
  async ({ projectId, ...input }, user) => {
    const pending = await db.changeOrderStatus.findUnique({ where: { code: "PENDING" } });
    if (!pending) throw new ActionError("The Pending change order status is missing. Check Settings → Change order statuses.");
    const co = await db.$transaction(async (tx) => {
      // Numbers are per project: CO-001, CO-002, …
      const count = await tx.changeOrder.count({ where: { projectId } });
      const created = await tx.changeOrder.create({ data: { projectId, ...input, number: `CO-${String(count + 1).padStart(3, "0")}`, statusId: pending.id } });
      await audit(tx, user.id, "create", "ChangeOrder", created.id, input);
      return created;
    });
    revalidatePath(`/projects/${projectId}`);
    return { message: `${co.number} added as Pending.` };
  },
);

/** Approve, reject or void a pending change order. Approving can add it to the schedule of values. */
export const decideChangeOrder = authorizedFormAction(
  "projects:billing",
  z.object({ id: requiredId("Change order"), decision: z.enum(["APPROVED", "REJECTED", "VOID"]), addToSov: checkbox }),
  async ({ id, decision, addToSov }, user) => {
    const co = await db.changeOrder.findUnique({ where: { id }, include: { status: true } });
    if (!co) throw new ActionError("That change order no longer exists.");
    if (co.status.code !== "PENDING") throw new ActionError(`${co.number} is already ${co.status.label.toLowerCase()}.`);
    const status = await db.changeOrderStatus.findUnique({ where: { code: decision } });
    if (!status) throw new ActionError("That change order status is missing. Check Settings.");
    await db.$transaction(async (tx) => {
      await tx.changeOrder.update({ where: { id }, data: { statusId: status.id, approvedAt: decision === "APPROVED" ? new Date() : null } });
      if (decision === "APPROVED" && addToSov && co.amountCents !== 0) {
        await tx.scheduleOfValuesLine.create({
          data: { projectId: co.projectId, description: `${co.number}: ${co.title}`, scheduledValueCents: co.amountCents, sortOrder: 1000, changeOrderId: co.id },
        });
      }
      await audit(tx, user.id, decision.toLowerCase(), "ChangeOrder", id, { addToSov });
    });
    revalidatePath(`/projects/${co.projectId}`);
    return { message: `${co.number} ${status.label.toLowerCase()}.` };
  },
);
