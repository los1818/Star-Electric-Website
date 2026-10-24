"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { MAX_HOURS_PER_DAY, addDays, hoursBetween, isValidDate, parseHoursHundredths } from "@/lib/timesheets";
import { optionalId, optionalText, requiredId, requiredText } from "@/lib/validation";
import { audit } from "@/server/audit";
import { workOrderScope } from "@/server/work-orders";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const dateField = z.string({ error: "Choose a date" }).refine(isValidDate, "Choose a date");
const timeField = z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 07:30").nullable().optional());

/** Whose timesheet this is. Technicians only ever act on their own; office can act for anyone. */
function targetEmployee(user: CurrentUser, employeeId: string | null): string {
  const own = user.employeeId;
  if (!employeeId || employeeId === own) {
    if (!own) throw new ActionError("Your login isn't linked to an employee yet. Ask the office to link you in Settings → Users.");
    return own;
  }
  if (!can(user.role, "timesheets:write_all")) throw new ActionError("You can only enter your own time.");
  return employeeId;
}

/** Whether this user may still change an entry. */
function assertEditable(user: CurrentUser, entry: { submittedAt: Date | null; approvedAt: Date | null }) {
  if (entry.approvedAt) throw new ActionError("This entry has been approved and is locked.");
  if (entry.submittedAt && !can(user.role, "timesheets:write_all")) throw new ActionError("This week has been submitted. Ask the office to send it back if something needs fixing.");
}

const entrySchema = z.object({
  id: optionalId,
  employeeId: optionalId,
  date: dateField,
  workOrderId: optionalId,
  itemTypeId: requiredId("Type"),
  hours: optionalText(10),
  startTime: timeField,
  endTime: timeField,
  description: optionalText(500),
  laborRateId: optionalId,
});

export const saveTimeEntry = authorizedFormAction("timesheets:write_own", entrySchema, async (input, user) => {
  const employeeId = targetEmployee(user, input.employeeId);

  // Hours: typed, or worked out from start/end.
  const errors: Record<string, string> = {};
  let hours: number | null = null;
  if (input.startTime && input.endTime) {
    hours = hoursBetween(input.startTime, input.endTime);
  } else if (input.startTime || input.endTime) {
    errors.endTime = "Enter both a start and an end time, or just the hours";
  }
  if (input.hours) {
    try {
      const typed = parseHoursHundredths(input.hours);
      if (hours !== null && typed !== hours) errors.hours = "Hours don't match the start and end times; clear one of them";
      hours = typed;
    } catch {
      errors.hours = "Enter hours like 7.5 or 7:30";
    }
  }
  if (hours === null && !errors.hours && !errors.endTime) errors.hours = "Enter the hours, or a start and end time";
  if (hours !== null && (hours <= 0 || hours > MAX_HOURS_PER_DAY)) errors.hours = "Hours must be more than 0 and no more than 24";

  const [itemType, workOrder] = await Promise.all([
    db.timesheetItemType.findUnique({ where: { id: input.itemTypeId } }),
    input.workOrderId ? db.workOrder.findFirst({ where: { AND: [{ id: input.workOrderId }, can(user.role, "timesheets:write_all") ? {} : workOrderScope(user)] }, select: { id: true } }) : null,
  ]);
  if (!itemType?.active) errors.itemTypeId = "Choose a type";
  if (itemType?.billable && !input.workOrderId) errors.workOrderId = `${itemType.label} time has to be on a work order`;
  if (input.workOrderId && !workOrder) errors.workOrderId = "Choose one of your work orders";
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const date = new Date(`${input.date}T00:00:00Z`);
  const others = await db.timeEntry.aggregate({ where: { employeeId, date, ...(input.id ? { NOT: { id: input.id } } : {}) }, _sum: { hoursHundredths: true } });
  if ((others._sum.hoursHundredths ?? 0) + hours! > MAX_HOURS_PER_DAY) throw new ValidationError({ hours: "That would be more than 24 hours on this day" });

  // Technicians can't pick a rate (it's pricing); it comes from their employee record.
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { laborRateId: true } });
  const laborRateId = can(user.role, "pricing:view") && input.laborRateId ? input.laborRateId : employee?.laborRateId ?? null;
  const toDateTime = (t: string | null | undefined) => (t ? new Date(`${input.date}T${t}:00-06:00`) : null);
  const data = {
    employeeId,
    date,
    workOrderId: input.workOrderId,
    itemTypeId: input.itemTypeId,
    laborRateId,
    hoursHundredths: hours!,
    startTime: toDateTime(input.startTime),
    endTime: toDateTime(input.endTime),
    description: input.description,
  };

  if (input.id) {
    const existing = await db.timeEntry.findUnique({ where: { id: input.id } });
    if (!existing) throw new ActionError("That entry no longer exists.");
    targetEmployee(user, existing.employeeId);
    assertEditable(user, existing);
    await db.timeEntry.update({ where: { id: input.id }, data });
    await audit(db, user.id, "update", "TimeEntry", input.id, data);
  } else {
    const created = await db.timeEntry.create({ data });
    await audit(db, user.id, "create", "TimeEntry", created.id, data);
  }
  revalidatePath("/timesheets");
  return { message: input.id ? "Entry updated." : "Time added." };
});

export const deleteTimeEntry = authorizedFormAction("timesheets:write_own", z.object({ id: requiredId("Entry") }), async ({ id }, user) => {
  const entry = await db.timeEntry.findUnique({ where: { id } });
  if (!entry) throw new ActionError("That entry no longer exists.");
  targetEmployee(user, entry.employeeId);
  assertEditable(user, entry);
  await db.timeEntry.delete({ where: { id } });
  await audit(db, user.id, "delete", "TimeEntry", id, { hoursHundredths: entry.hoursHundredths, date: entry.date });
  revalidatePath("/timesheets");
  return { message: "Entry removed." };
});

const weekSchema = z.object({ weekStart: dateField, employeeId: optionalId });

function weekRange(monday: string) {
  return { gte: new Date(`${monday}T00:00:00Z`), lt: new Date(`${addDays(monday, 7)}T00:00:00Z`) };
}

/** An employee submits their week's draft entries for approval. */
export const submitWeek = authorizedFormAction("timesheets:write_own", weekSchema, async ({ weekStart, employeeId }, user) => {
  const target = targetEmployee(user, employeeId);
  const { count } = await db.timeEntry.updateMany({ where: { employeeId: target, date: weekRange(weekStart), submittedAt: null }, data: { submittedAt: new Date() } });
  if (count === 0) throw new ActionError("There's nothing new to submit for this week.");
  await audit(db, user.id, "submit_week", "Employee", target, { weekStart, entries: count });
  revalidatePath("/timesheets");
  return { message: `Submitted ${count} ${count === 1 ? "entry" : "entries"} for approval.` };
});

/** Office approves an employee's submitted entries for the week. Approved entries lock. */
export const approveWeek = authorizedFormAction("timesheets:approve", z.object({ weekStart: dateField, employeeId: requiredId("Employee") }), async ({ weekStart, employeeId }, user) => {
  const { count } = await db.timeEntry.updateMany({
    where: { employeeId, date: weekRange(weekStart), submittedAt: { not: null }, approvedAt: null },
    data: { approvedAt: new Date(), approvedById: user.id },
  });
  if (count === 0) throw new ActionError("There are no submitted entries to approve for this week.");
  await audit(db, user.id, "approve_week", "Employee", employeeId, { weekStart, entries: count });
  revalidatePath("/timesheets");
  return { message: `Approved ${count} ${count === 1 ? "entry" : "entries"}.` };
});

/** Office sends submitted (not yet approved) entries back so the employee can fix them. */
export const sendBackWeek = authorizedFormAction(
  "timesheets:approve",
  z.object({ weekStart: dateField, employeeId: requiredId("Employee"), reason: requiredText("Reason", 500) }),
  async ({ weekStart, employeeId, reason }, user) => {
    const { count } = await db.timeEntry.updateMany({ where: { employeeId, date: weekRange(weekStart), submittedAt: { not: null }, approvedAt: null }, data: { submittedAt: null } });
    if (count === 0) throw new ActionError("There are no submitted entries to send back.");
    await audit(db, user.id, "send_back_week", "Employee", employeeId, { weekStart, entries: count, reason });
    revalidatePath("/timesheets");
    return { message: `Sent ${count} ${count === 1 ? "entry" : "entries"} back: “${reason}”` };
  },
);

/** Administrators can reopen an approved entry that hasn't been invoiced. */
export const reopenTimeEntry = authorizedFormAction("timesheets:approve", z.object({ id: requiredId("Entry") }), async ({ id }, user) => {
  if (user.role !== "ADMIN") throw new ActionError("Only an administrator can reopen approved time.");
  const entry = await db.timeEntry.findUnique({ where: { id } });
  if (!entry) throw new ActionError("That entry no longer exists.");
  if (entry.invoiceLineId) throw new ActionError("This time has been invoiced, so it can't be reopened.");
  await db.timeEntry.update({ where: { id }, data: { approvedAt: null, approvedById: null, submittedAt: null } });
  await audit(db, user.id, "reopen", "TimeEntry", id);
  revalidatePath("/timesheets");
  return { message: "Entry reopened." };
});
