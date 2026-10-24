"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { reginaTime } from "@/lib/time";
import { addDays, isValidDate } from "@/lib/timesheets";
import { checkbox, optionalId, optionalText, requiredId } from "@/lib/validation";
import { audit } from "@/server/audit";
import { ActionError, ValidationError, authorizedFormAction } from "./authorized-action";

const MAX_DAYS = 31;
const dateField = z.string({ error: "Choose a date" }).refine(isValidDate, "Choose a date");
const timeField = (label: string) => z.string({ error: `${label} is required` }).regex(/^\d{2}:\d{2}$/, `${label} must be a time like 07:00`);

function instant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return reginaTime(y, m - 1, d, h, mi);
}

/** Weekdays from `from` through `to` (inclusive), Regina calendar. Weekends included only if asked. */
async function daysInRange(from: string, to: string, includeWeekends: boolean): Promise<string[]> {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_DAYS; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (includeWeekends || (dow !== 0 && dow !== 6)) out.push(d);
  }
  return out;
}

async function findOverlaps(employeeId: string, blocks: { startsAt: Date; endsAt: Date }[], ignoreId?: string) {
  if (!blocks.length) return [];
  return db.scheduleEntry.findMany({
    where: {
      employeeId,
      ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      OR: blocks.map((b) => ({ startsAt: { lt: b.endsAt }, endsAt: { gt: b.startsAt } })),
    },
    include: { workOrder: { select: { number: true } } },
    take: 3,
  });
}

/** Putting someone on the schedule for a work order also puts them on its crew and moves New → Scheduled. */
async function linkToWorkOrder(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], workOrderId: string, employeeId: string, firstStart: Date, lastEnd: Date) {
  await tx.workOrderAssignment.upsert({
    where: { workOrderId_employeeId: { workOrderId, employeeId } },
    create: { workOrderId, employeeId },
    update: {},
  });
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, include: { status: true } });
  if (!wo) return;
  const scheduled = wo.status.code === "NEW" ? await tx.workOrderStatus.findUnique({ where: { code: "SCHEDULED" } }) : null;
  await tx.workOrder.update({
    where: { id: workOrderId },
    data: {
      ...(scheduled ? { statusId: scheduled.id } : {}),
      ...(!wo.scheduledStart ? { scheduledStart: firstStart, scheduledEnd: lastEnd } : {}),
    },
  });
}

const blockSchema = z.object({
  employeeId: requiredId("Electrician"),
  workOrderId: optionalId,
  date: dateField,
  throughDate: z.preprocess((v) => (v === "" ? undefined : v), dateField.optional()),
  startTime: timeField("Start"),
  endTime: timeField("End"),
  includeWeekends: checkbox,
  allowOverlap: checkbox,
  notes: optionalText(300),
});

/** Add one block, or one per day through `throughDate` (weekdays unless weekends are included). */
export const createScheduleEntries = authorizedFormAction("dispatch:manage", blockSchema, async (input, user) => {
  const errors: Record<string, string> = {};
  if (input.endTime <= input.startTime) errors.endTime = "End must be after the start";
  if (input.throughDate && input.throughDate < input.date) errors.throughDate = "Must be on or after the first day";
  if (!input.workOrderId && !input.notes) errors.notes = "Without a work order, say what it's for (e.g. shop day, training)";
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const days = await daysInRange(input.date, input.throughDate ?? input.date, input.includeWeekends || !input.throughDate);
  if (days.length === 0) throw new ValidationError({ throughDate: "That range only has weekend days. Tick “Include weekends”." });
  if (days.length > MAX_DAYS) throw new ValidationError({ throughDate: `Schedule at most ${MAX_DAYS} days at a time` });
  const blocks = days.map((d) => ({ startsAt: instant(d, input.startTime), endsAt: instant(d, input.endTime) }));

  const [employee, workOrder] = await Promise.all([
    db.employee.findUnique({ where: { id: input.employeeId }, select: { active: true, firstName: true } }),
    input.workOrderId ? db.workOrder.findUnique({ where: { id: input.workOrderId }, include: { status: true } }) : null,
  ]);
  if (!employee?.active) throw new ValidationError({ employeeId: "Choose an active electrician" });
  if (input.workOrderId && (!workOrder || workOrder.status.isClosed)) throw new ValidationError({ workOrderId: "Choose an open work order" });

  if (!input.allowOverlap) {
    const clashes = await findOverlaps(input.employeeId, blocks);
    if (clashes.length) {
      const what = clashes.map((c) => c.workOrder?.number ?? c.notes ?? "another booking").join(", ");
      throw new ActionError(`${employee.firstName} is already booked then (${what}). Pick another time, or tick “Allow double-booking”.`);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.scheduleEntry.createMany({
      data: blocks.map((b) => ({ employeeId: input.employeeId, workOrderId: input.workOrderId, projectId: workOrder?.projectId ?? null, notes: input.notes, ...b })),
    });
    if (input.workOrderId) await linkToWorkOrder(tx, input.workOrderId, input.employeeId, blocks[0].startsAt, blocks[0].endsAt);
    await audit(tx, user.id, "schedule", "Employee", input.employeeId, { workOrderId: input.workOrderId, days });
  });
  revalidatePath("/dispatch");
  return { message: days.length === 1 ? `Booked ${employee.firstName}.` : `Booked ${employee.firstName} for ${days.length} days.` };
});

export const updateScheduleEntry = authorizedFormAction(
  "dispatch:manage",
  z.object({ id: requiredId("Booking"), employeeId: requiredId("Electrician"), workOrderId: optionalId, date: dateField, startTime: timeField("Start"), endTime: timeField("End"), allowOverlap: checkbox, notes: optionalText(300) }),
  async ({ id, ...input }, user) => {
    if (input.endTime <= input.startTime) throw new ValidationError({ endTime: "End must be after the start" });
    if (!input.workOrderId && !input.notes) throw new ValidationError({ notes: "Without a work order, say what it's for" });
    const block = { startsAt: instant(input.date, input.startTime), endsAt: instant(input.date, input.endTime) };
    if (!input.allowOverlap && (await findOverlaps(input.employeeId, [block], id)).length) {
      throw new ActionError("That overlaps another booking for this person. Pick another time, or tick “Allow double-booking”.");
    }
    const wo = input.workOrderId ? await db.workOrder.findUnique({ where: { id: input.workOrderId }, select: { projectId: true } }) : null;
    await db.$transaction(async (tx) => {
      await tx.scheduleEntry.update({ where: { id }, data: { employeeId: input.employeeId, workOrderId: input.workOrderId, projectId: wo?.projectId ?? null, notes: input.notes, ...block } });
      if (input.workOrderId) await linkToWorkOrder(tx, input.workOrderId, input.employeeId, block.startsAt, block.endsAt);
      await audit(tx, user.id, "reschedule", "ScheduleEntry", id, input);
    });
    revalidatePath("/dispatch");
    return { message: "Booking updated." };
  },
);

export const deleteScheduleEntry = authorizedFormAction("dispatch:manage", z.object({ id: requiredId("Booking") }), async ({ id }, user) => {
  const entry = await db.scheduleEntry.findUnique({ where: { id } });
  if (!entry) throw new ActionError("That booking no longer exists.");
  await db.scheduleEntry.delete({ where: { id } });
  await audit(db, user.id, "unschedule", "ScheduleEntry", id, { employeeId: entry.employeeId, workOrderId: entry.workOrderId, startsAt: entry.startsAt });
  revalidatePath("/dispatch");
  return { message: "Booking removed." };
});
