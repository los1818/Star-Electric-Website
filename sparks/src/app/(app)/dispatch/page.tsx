import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { param, type SearchParams } from "@/lib/list-params";
import { formatTime, reginaDate, reginaTime, reginaToday, toReginaDateTimeLocal } from "@/lib/time";
import { addDays, isValidDate, weekDays, weekStart as mondayOf } from "@/lib/timesheets";
import { createScheduleEntries, deleteScheduleEntry, updateScheduleEntry } from "@/server/actions/schedule";
import { BookingForm } from "./booking-forms";

export const metadata = { title: "Dispatch Board" };

const dayHeading = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const startOfDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return reginaTime(y, m - 1, day);
};
const reginaDay = (instant: Date) => {
  const { year, month, day } = reginaDate(instant);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export default async function DispatchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageAccess("dispatch:manage");
  const sp = await searchParams;
  const weekParam = param(sp, "week");
  const monday = mondayOf(isValidDate(weekParam) ? weekParam : reginaToday());
  const days = weekDays(monday);
  const today = reginaToday();

  const [employees, entries, openWorkOrders] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, trade: { select: { label: true } } } }),
    db.scheduleEntry.findMany({
      where: { startsAt: { lt: startOfDay(addDays(monday, 7)) }, endsAt: { gt: startOfDay(monday) } },
      orderBy: { startsAt: "asc" },
      include: { workOrder: { select: { id: true, number: true, summary: true, status: { select: { label: true, color: true } }, priority: { select: { code: true, label: true, color: true } } } } },
    }),
    db.workOrder.findMany({
      where: { status: { isClosed: false, code: { notIn: ["COMPLETED", "INVOICED"] } } },
      orderBy: [{ priority: { sortOrder: "desc" } }, { number: "desc" }],
      include: { customer: { select: { name: true } }, priority: true, status: true, scheduleEntries: { where: { endsAt: { gte: new Date() } }, select: { id: true }, take: 1 } },
    }),
  ]);

  const options = {
    employees: employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
    workOrders: openWorkOrders.map((w) => ({ value: w.id, label: `${w.number} ${w.summary} (${w.customer.name})` })),
  };
  const unscheduled = openWorkOrders.filter((w) => w.scheduleEntries.length === 0);
  const prefill = { workOrderId: param(sp, "wo") || null, employeeId: param(sp, "employee") || null, date: isValidDate(param(sp, "date")) ? param(sp, "date") : days.includes(today) ? today : monday };
  const weekLink = (w: string) => `/dispatch?week=${w}`;

  return (
    <div className="max-w-[90rem]">
      <PageHeader title="Dispatch Board" subtitle="Who's where, by day. Booking someone onto a work order also adds them to its crew." />

      <Card title="Book someone" className="mb-6">
        {/* Keyed so clicking "+" in a cell or "Schedule →" refills the form. */}
        <BookingForm key={`${prefill.employeeId}-${prefill.workOrderId}-${prefill.date}`} action={createScheduleEntries} values={prefill} options={options} />
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Link href={weekLink(addDays(monday, -7))} className="font-semibold hover:underline">← Previous week</Link>
        <span className="font-bold">Week of {dayHeading(monday)}</span>
        <Link href={weekLink(addDays(monday, 7))} className="font-semibold hover:underline">Next week →</Link>
        <Link href={weekLink(mondayOf(today))} className="text-muted hover:underline">This week</Link>
      </div>

      <div className="overflow-x-auto rounded-md bg-white shadow-card">
        <table className="w-full min-w-[60rem] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-muted">
              <th className="w-40 px-3 py-2 font-semibold">Electrician</th>
              {days.map((d) => (
                <th key={d} className={`px-2 py-2 font-semibold ${d === today ? "bg-amber-50 text-ink" : ""}`}>{dayHeading(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 align-top last:border-0">
                <th scope="row" className="px-3 py-2 text-left">
                  <Link href={`/employees/${e.id}`} className="text-sm font-semibold hover:underline">{e.firstName} {e.lastName}</Link>
                  <div className="font-normal text-muted">{e.trade?.label}</div>
                </th>
                {days.map((d) => {
                  const cell = entries.filter((x) => x.employeeId === e.id && reginaDay(x.startsAt) === d);
                  return (
                    <td key={d} className={`px-1.5 py-1.5 ${d === today ? "bg-amber-50/50" : ""}`}>
                      <div className="space-y-1">
                        {cell.map((x) => (
                          <details key={x.id} className="group rounded border-l-4 bg-surface px-2 py-1" style={{ borderLeftColor: x.workOrder?.status.color ?? "#9ca3af" }}>
                            <summary className="cursor-pointer list-none">
                              <span className="font-bold">{formatTime(x.startsAt)}–{formatTime(x.endsAt)}</span>
                              {x.workOrder ? (
                                <span className="block truncate" title={`${x.workOrder.number} ${x.workOrder.summary}`}>
                                  {x.workOrder.priority.code === "EMERGENCY" && <span className="mr-1 font-bold text-red-700">!</span>}
                                  {x.workOrder.number} {x.workOrder.summary}
                                </span>
                              ) : (
                                <span className="block truncate text-muted">{x.notes}</span>
                              )}
                            </summary>
                            {x.workOrder && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge color={x.workOrder.status.color}>{x.workOrder.status.label}</Badge>
                                <Link href={`/work-orders/${x.workOrder.id}`} className="font-semibold hover:underline">Open</Link>
                              </div>
                            )}
                            <BookingForm
                              action={updateScheduleEntry}
                              compact
                              options={options}
                              values={{ id: x.id, employeeId: x.employeeId, workOrderId: x.workOrderId, date: d, startTime: toReginaDateTimeLocal(x.startsAt).slice(11), endTime: toReginaDateTimeLocal(x.endsAt).slice(11), notes: x.notes }}
                            />
                            <div className="mt-1"><InlineAction action={deleteScheduleEntry} fields={{ id: x.id }} label="Remove" variant="danger" confirm="Remove this booking?" /></div>
                          </details>
                        ))}
                        <Link href={`/dispatch?week=${monday}&employee=${e.id}&date=${d}`} className="block rounded px-1 text-muted opacity-60 hover:bg-surface hover:opacity-100" aria-label={`Book ${e.firstName} on ${dayHeading(d)}`}>
                          +
                        </Link>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card title={`Unscheduled work (${unscheduled.length})`} className="mt-6">
        {unscheduled.length === 0 ? (
          <p className="text-sm text-muted">Every open work order has a booking coming up.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {unscheduled.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link>
                <span>{w.summary}</span>
                <Badge color={w.status.color}>{w.status.label}</Badge>
                {w.priority.code !== "NORMAL" && <Badge color={w.priority.color}>{w.priority.label}</Badge>}
                <span className="text-muted">{w.customer.name}</span>
                <Link href={`/dispatch?week=${monday}&wo=${w.id}`} className="ml-auto text-xs font-bold hover:underline">Schedule →</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
