import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess, type CurrentUser } from "@/lib/auth/server";
import { param, type SearchParams } from "@/lib/list-params";
import { formatHours } from "@/lib/money";
import { reginaToday, toReginaDateTimeLocal } from "@/lib/time";
import { addDays, entryState, isValidDate, weekDays, weekStart as mondayOf } from "@/lib/timesheets";
import { approveWeek, deleteTimeEntry, reopenTimeEntry, saveTimeEntry, sendBackWeek, submitWeek } from "@/server/actions/timesheets";
import { laborRateOptions } from "../employees/options";
import { SendBackForm, TimeEntryForm } from "./time-entry-form";

export const metadata = { title: "Timesheets" };

const STATE_BADGE = {
  draft: <Badge>Draft</Badge>,
  submitted: <Badge color="#2563eb">Submitted</Badge>,
  approved: <Badge color="#059669">Approved</Badge>,
};

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

function WeekNav({ monday, employeeId }: { monday: string; employeeId?: string }) {
  const q = (w: string) => `/timesheets?week=${w}${employeeId ? `&employee=${employeeId}` : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link href={q(addDays(monday, -7))} className="font-semibold hover:underline">← Previous week</Link>
      <span className="font-bold">Week of {dayLabel(monday)}</span>
      <Link href={q(addDays(monday, 7))} className="font-semibold hover:underline">Next week →</Link>
      <Link href={q(mondayOf(reginaToday()))} className="text-muted hover:underline">This week</Link>
    </div>
  );
}

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("timesheets:read_own", "timesheets:read_all");
  const sp = await searchParams;
  const weekParam = param(sp, "week");
  const monday = mondayOf(isValidDate(weekParam) ? weekParam : reginaToday());
  const employeeParam = param(sp, "employee");
  const seesAll = can(user.role, "timesheets:read_all");

  if (seesAll && !employeeParam) return <Overview monday={monday} user={user} />;
  const employeeId = seesAll ? employeeParam : user.employeeId;
  if (!employeeId) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Timesheets" />
        <p className="rounded-md bg-white p-6 text-sm shadow-card">Your login isn&apos;t linked to an employee yet. Ask the office to link you in Settings → Users.</p>
      </div>
    );
  }
  return <WeekSheet monday={monday} employeeId={employeeId} user={user} />;
}

async function Overview({ monday, user }: { monday: string; user: CurrentUser }) {
  const range = { gte: new Date(`${monday}T00:00:00Z`), lt: new Date(`${addDays(monday, 7)}T00:00:00Z`) };
  const [employees, entries] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    db.timeEntry.findMany({ where: { date: range }, select: { employeeId: true, hoursHundredths: true, submittedAt: true, approvedAt: true } }),
  ]);
  const byEmployee = new Map<string, { hours: number; draft: number; submitted: number; approved: number }>();
  for (const e of entries) {
    const row = byEmployee.get(e.employeeId) ?? { hours: 0, draft: 0, submitted: 0, approved: 0 };
    row.hours += e.hoursHundredths;
    row[entryState(e)]++;
    byEmployee.set(e.employeeId, row);
  }
  const waiting = [...byEmployee.values()].reduce((s, r) => s + r.submitted, 0);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Timesheets"
        subtitle={can(user.role, "timesheets:approve") ? `${waiting} submitted ${waiting === 1 ? "entry is" : "entries are"} waiting for approval this week.` : "Everyone's time for the week."}
        actions={user.employeeId && <Link href={`/timesheets?week=${monday}&employee=${user.employeeId}`} className="text-sm font-semibold hover:underline">My own timesheet →</Link>}
      />
      <div className="mb-4"><WeekNav monday={monday} /></div>
      <div className="overflow-x-auto rounded-md bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Employee</th>
              <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const r = byEmployee.get(e.id);
              return (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-amber-50/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/timesheets?week=${monday}&employee=${e.id}`} className="font-semibold hover:underline">{e.lastName}, {e.firstName}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatHours(r?.hours ?? 0)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {!r && <span className="text-muted">No time</span>}
                      {r?.submitted ? <Badge color="#2563eb">{r.submitted} to approve</Badge> : null}
                      {r?.draft ? <Badge>{r.draft} draft</Badge> : null}
                      {r?.approved ? <Badge color="#059669">{r.approved} approved</Badge> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function WeekSheet({ monday, employeeId, user }: { monday: string; employeeId: string; user: CurrentUser }) {
  const days = weekDays(monday);
  const range = { gte: new Date(`${monday}T00:00:00Z`), lt: new Date(`${addDays(monday, 7)}T00:00:00Z`) };
  const seesAll = can(user.role, "timesheets:write_all");
  const recent = new Date(Date.now() - 30 * 86_400_000);
  const [employee, entries, itemTypes, workOrders] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true } }),
    db.timeEntry.findMany({
      where: { employeeId, date: range },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: { itemType: true, workOrder: { select: { id: true, number: true, summary: true } } },
    }),
    db.timesheetItemType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.workOrder.findMany({
      where: {
        AND: [
          seesAll ? {} : { assignments: { some: { employeeId } } },
          { OR: [{ status: { isClosed: false, code: { not: "INVOICED" } } }, { completedAt: { gte: recent } }] },
        ],
      },
      orderBy: { number: "desc" },
      take: 300,
      select: { id: true, number: true, summary: true, customer: { select: { name: true } } },
    }),
  ]);
  if (!employee) return <p className="text-sm">That employee doesn&apos;t exist.</p>;

  const isOwn = employeeId === user.employeeId;
  const canWrite = isOwn || seesAll;
  const total = entries.reduce((s, e) => s + e.hoursHundredths, 0);
  const counts = { draft: 0, submitted: 0, approved: 0 };
  for (const e of entries) counts[entryState(e)]++;
  const options = {
    workOrders: workOrders.map((w) => ({ value: w.id, label: `${w.number} ${w.summary} (${w.customer.name})` })),
    itemTypes: itemTypes.map((t) => ({ value: t.id, label: t.label })),
    laborRates: can(user.role, "pricing:view") ? await laborRateOptions(user.role) : undefined,
  };
  const today = reginaToday();
  const defaultDate = days.includes(today) ? today : monday;
  const regular = itemTypes.find((t) => t.code === "REGULAR")?.id ?? itemTypes[0]?.id;
  const clock = (d: Date | null) => (d ? toReginaDateTimeLocal(d).slice(11, 16) : "");

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isOwn ? "My timesheet" : `${employee.firstName} ${employee.lastName}`}
        back={seesAll ? { href: `/timesheets?week=${monday}`, label: "All timesheets" } : undefined}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">{formatHours(total)} hours</span>
            {counts.draft > 0 && <Badge>{counts.draft} draft</Badge>}
            {counts.submitted > 0 && <Badge color="#2563eb">{counts.submitted} submitted</Badge>}
            {counts.approved > 0 && <Badge color="#059669">{counts.approved} approved</Badge>}
          </span>
        }
      />
      <div className="mb-4"><WeekNav monday={monday} employeeId={seesAll ? employeeId : undefined} /></div>

      {canWrite && (
        <Card title="Add time" className="mb-6">
          <TimeEntryForm action={saveTimeEntry} employeeId={employeeId} values={{ date: defaultDate, itemTypeId: regular }} options={options} />
        </Card>
      )}

      <div className="space-y-4">
        {days.map((d) => {
          const dayEntries = entries.filter((e) => e.date.toISOString().slice(0, 10) === d);
          if (dayEntries.length === 0 && !["Sat", "Sun"].some((x) => dayLabel(d).startsWith(x))) {
            return (
              <div key={d} className="flex items-center justify-between rounded-md bg-white px-5 py-3 text-sm shadow-card">
                <span className="font-semibold">{dayLabel(d)}</span>
                <span className="text-muted">No time</span>
              </div>
            );
          }
          if (dayEntries.length === 0) return null;
          return (
            <section key={d} className="rounded-md bg-white shadow-card">
              <header className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5 text-sm">
                <span className="font-bold">{dayLabel(d)}</span>
                <span className="font-bold tabular-nums">{formatHours(dayEntries.reduce((s, e) => s + e.hoursHundredths, 0))} h</span>
              </header>
              <ul className="divide-y divide-gray-100">
                {dayEntries.map((e) => {
                  const state = entryState(e);
                  const editable = canWrite && state !== "approved" && (state === "draft" || seesAll);
                  return (
                    <li key={e.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-14 font-bold tabular-nums">{formatHours(e.hoursHundredths)}</span>
                        <span>{e.itemType.label}</span>
                        {e.workOrder ? (
                          <Link href={`/work-orders/${e.workOrder.id}`} className="font-semibold hover:underline">{e.workOrder.number} {e.workOrder.summary}</Link>
                        ) : (
                          <span className="text-muted">No work order</span>
                        )}
                        {STATE_BADGE[state]}
                        {e.startTime && e.endTime && <span className="text-xs text-muted">{clock(e.startTime)}–{clock(e.endTime)}</span>}
                      </div>
                      {e.description && <p className="mt-1 pl-16 text-muted">{e.description}</p>}
                      {editable && (
                        <details className="mt-1 pl-16">
                          <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Edit</summary>
                          <TimeEntryForm
                            action={saveTimeEntry}
                            employeeId={employeeId}
                            options={options}
                            values={{ id: e.id, date: d, workOrderId: e.workOrderId, itemTypeId: e.itemTypeId, hours: formatHours(e.hoursHundredths), description: e.description, laborRateId: e.laborRateId }}
                          />
                          <div className="mt-2"><InlineAction action={deleteTimeEntry} fields={{ id: e.id }} label="Remove entry" variant="danger" confirm="Remove this entry?" /></div>
                        </details>
                      )}
                      {state === "approved" && user.role === "ADMIN" && !e.invoiceLineId && (
                        <div className="mt-1 pl-16"><InlineAction action={reopenTimeEntry} fields={{ id: e.id }} label="Reopen" confirm="Reopen this approved entry for editing?" /></div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-6 space-y-3 rounded-md bg-white p-5 shadow-card">
        {canWrite && counts.draft > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <InlineAction action={submitWeek} fields={{ weekStart: monday, employeeId }} label={`Submit week (${counts.draft} ${counts.draft === 1 ? "entry" : "entries"})`} variant="primary" confirm="Submit this week's time for approval? You won't be able to change it after." />
            <span className="text-sm text-muted">Submit when the week is complete. The office reviews and approves it.</span>
          </div>
        )}
        {counts.draft === 0 && counts.submitted > 0 && !can(user.role, "timesheets:approve") && <p className="text-sm text-muted">Submitted. Waiting for the office to approve.</p>}
        {can(user.role, "timesheets:approve") && counts.submitted > 0 && (
          <div>
            <InlineAction action={approveWeek} fields={{ weekStart: monday, employeeId }} label={`Approve ${counts.submitted} submitted ${counts.submitted === 1 ? "entry" : "entries"}`} variant="primary" />
            <SendBackForm action={sendBackWeek} employeeId={employeeId} weekStart={monday} />
          </div>
        )}
        {entries.length > 0 && counts.draft === 0 && counts.submitted === 0 && <p className="text-sm font-semibold text-green-800">This week is approved.</p>}
        {entries.length === 0 && <p className="text-sm text-muted">No time entered this week yet.</p>}
      </div>
    </div>
  );
}
