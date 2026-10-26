"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { checkbox, idList, optionalId, optionalMoney, optionalReginaDateTime, optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit, changedFields } from "@/server/audit";
import { nextJobNumber, nextNumber } from "@/server/numbering";
import { allowedNextStatuses, workOrderScope } from "@/server/work-orders";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const workOrderFields = {
  customerId: requiredId("Customer"),
  jobSiteId: requiredId("Job site"),
  contactId: optionalId,
  projectId: optionalId,
  typeId: requiredId("Type"),
  priorityId: requiredId("Priority"),
  summary: requiredText("Summary", 200),
  description: optionalText(10_000),
  customerPoNumber: optionalText(60),
  notToExceedCents: optionalMoney("Not-to-exceed"),
  scheduledStart: optionalReginaDateTime("Planned start"),
  scheduledEnd: optionalReginaDateTime("Planned end"),
  assigneeIds: idList,
  leadEmployeeId: optionalId,
};

type WorkOrderInput = z.infer<z.ZodObject<typeof workOrderFields>>;

/** Cross-field checks that need the database: site/contact/project belong to the customer, etc. */
async function checkRelations(input: WorkOrderInput) {
  const errors: Record<string, string> = {};
  const [site, contact, project, employees] = await Promise.all([
    db.jobSite.findUnique({ where: { id: input.jobSiteId }, select: { customerId: true, active: true } }),
    input.contactId ? db.contact.findUnique({ where: { id: input.contactId }, select: { customerId: true } }) : null,
    input.projectId ? db.project.findUnique({ where: { id: input.projectId }, select: { customerId: true } }) : null,
    input.assigneeIds.length ? db.employee.findMany({ where: { id: { in: input.assigneeIds } }, select: { id: true } }) : [],
  ]);
  if (!site || site.customerId !== input.customerId) errors.jobSiteId = "Choose a job site for this customer";
  if (input.contactId && contact?.customerId !== input.customerId) errors.contactId = "Choose a contact for this customer";
  if (input.projectId && project?.customerId !== input.customerId) errors.projectId = "Choose a project for this customer";
  if (employees.length !== input.assigneeIds.length) errors.assigneeIds = "One of the selected people no longer exists";
  if (input.leadEmployeeId && !input.assigneeIds.includes(input.leadEmployeeId)) errors.leadEmployeeId = "The lead must be one of the assigned people";
  if (input.scheduledStart && input.scheduledEnd && input.scheduledEnd <= input.scheduledStart) errors.scheduledEnd = "Planned end must be after the start";
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

function assignmentRows(input: WorkOrderInput) {
  const lead = input.leadEmployeeId ?? input.assigneeIds[0];
  return input.assigneeIds.map((employeeId) => ({ employeeId, isLead: employeeId === lead }));
}

function workOrderData(input: WorkOrderInput) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { assigneeIds, leadEmployeeId, ...data } = input;
  return data;
}

export const createWorkOrder = authorizedFormAction("workorders:write", z.object(workOrderFields), async (input, user) => {
  await checkRelations(input);
  // New work orders start as New, or Scheduled when they already have people and a time.
  const statusCode = input.assigneeIds.length && input.scheduledStart ? "SCHEDULED" : "NEW";
  const status = await db.workOrderStatus.findUnique({ where: { code: statusCode } });
  if (!status) throw new ActionError(`The “${statusCode}” work order status is missing. Check Settings → Work order statuses.`);
  const wo = await db.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        ...workOrderData(input),
        number: await nextNumber(tx, "WORK_ORDER"),
        // Stand-alone work gets its own job number; work under a project uses the project's.
        jobNumber: input.projectId ? null : await nextJobNumber(tx),
        statusId: status.id,
        assignments: { create: assignmentRows(input) },
      },
    });
    await audit(tx, user.id, "create", "WorkOrder", created.id, input);
    return created;
  });
  revalidatePath("/work-orders");
  return { redirectTo: `/work-orders/${wo.id}` };
});

export const updateWorkOrder = authorizedFormAction("workorders:write", z.object({ id: requiredId("Work order"), ...workOrderFields }), async ({ id, ...input }, user) => {
  await checkRelations(input);
  const before = await db.workOrder.findUnique({ where: { id }, include: { status: true, invoices: { select: { invoiceId: true } } } });
  if (!before) throw new ActionError("That work order no longer exists.");
  if (before.invoices.length && before.customerId !== input.customerId) throw new ActionError("This work order has been invoiced, so its customer can't change.");
  const data = workOrderData(input);
  await db.$transaction(async (tx) => {
    // Taken off a project and never had its own job number: give it one. (A work order moved onto a
    // project keeps any number it had, so paperwork already issued still matches.)
    const jobNumber = !input.projectId && !before.jobNumber ? await nextJobNumber(tx) : undefined;
    await tx.workOrder.update({ where: { id }, data: { ...data, ...(jobNumber ? { jobNumber } : {}) } });
    await tx.workOrderAssignment.deleteMany({ where: { workOrderId: id, employeeId: { notIn: input.assigneeIds } } });
    for (const a of assignmentRows(input)) {
      await tx.workOrderAssignment.upsert({
        where: { workOrderId_employeeId: { workOrderId: id, employeeId: a.employeeId } },
        create: { workOrderId: id, ...a },
        update: { isLead: a.isLead },
      });
    }
    await audit(tx, user.id, "update", "WorkOrder", id, { ...changedFields(before, data), assigneeIds: input.assigneeIds });
  });
  revalidatePath(`/work-orders/${id}`);
  return { redirectTo: `/work-orders/${id}` };
});

/** Move a work order to another status. Technicians may only act on work orders assigned to them. */
export const changeWorkOrderStatus = authorizedFormAction(
  "workorders:update_status",
  z.object({ id: requiredId("Work order"), statusId: requiredId("Status") }),
  async ({ id, statusId }, user) => {
    const wo = await db.workOrder.findFirst({ where: { AND: [{ id }, workOrderScope(user)] }, include: { status: true } });
    if (!wo) throw new ActionError("You can't change that work order.");
    const allowed = await allowedNextStatuses(user, wo.statusId);
    const next = allowed.find((s) => s.id === statusId);
    if (!next) throw new ActionError(`A work order can't go from ${wo.status.label} to that status.`);
    const completedAt = next.code === "COMPLETED" ? new Date() : ["NEW", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"].includes(next.code) ? null : wo.completedAt;
    await db.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id }, data: { statusId, completedAt } });
      await tx.workOrderNote.create({ data: { workOrderId: id, authorId: user.id, body: `Status changed from ${wo.status.label} to ${next.label}.` } });
      await audit(tx, user.id, "status", "WorkOrder", id, { from: wo.status.code, to: next.code });
    });
    revalidatePath(`/work-orders/${id}`);
    return { message: `Status changed to ${next.label}.` };
  },
);

export const addWorkOrderNote = authorizedFormAction(
  "workorders:add_notes",
  z.object({ workOrderId: requiredId("Work order"), body: requiredText("Note", 10_000), customerVisible: checkbox }),
  async ({ workOrderId, body, customerVisible }, user) => {
    const wo = await db.workOrder.findFirst({ where: { AND: [{ id: workOrderId }, workOrderScope(user)] }, select: { id: true } });
    if (!wo) throw new ActionError("You can't add notes to that work order.");
    await db.workOrderNote.create({ data: { workOrderId, authorId: user.id, body, customerVisible: can(user.role, "workorders:write") && customerVisible } });
    revalidatePath(`/work-orders/${workOrderId}`);
    return { message: "Note added." };
  },
);
