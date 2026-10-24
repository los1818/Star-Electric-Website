import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { reginaDayRange } from "@/lib/time";

/** Office/admin overview: what needs attention today. */
export async function OfficeDashboard({ user }: { user: CurrentUser }) {
  const today = reginaDayRange(new Date());
  const [open, crewToday, unscheduled, urgent, timesheetsWaiting, pendingCos] = await Promise.all([
    db.workOrder.count({ where: { status: { isClosed: false } } }),
    db.scheduleEntry.findMany({ where: { startsAt: { lt: today.end }, endsAt: { gt: today.start } }, distinct: ["employeeId"], select: { employeeId: true } }),
    db.workOrder.findMany({
      where: { status: { isClosed: false, code: { notIn: ["COMPLETED", "INVOICED", "ON_HOLD"] } }, scheduleEntries: { none: {} }, scheduledStart: null },
      orderBy: [{ priority: { sortOrder: "desc" } }, { requestedAt: "asc" }],
      take: 8,
      include: { customer: { select: { name: true } }, priority: true },
    }),
    db.workOrder.findMany({
      where: { status: { isClosed: false, code: { notIn: ["COMPLETED", "INVOICED"] } }, priority: { code: { in: ["EMERGENCY", "HIGH"] } } },
      orderBy: [{ priority: { sortOrder: "desc" } }, { requestedAt: "asc" }],
      take: 8,
      include: { customer: { select: { name: true } }, priority: true, status: true },
    }),
    db.timeEntry.count({ where: { submittedAt: { not: null }, approvedAt: null } }),
    can(user.role, "projects:read") ? db.changeOrder.count({ where: { status: { code: "PENDING" } } }) : Promise.resolve(0),
  ]);
  const readyToBill = can(user.role, "invoices:read") ? await db.workOrder.count({ where: { status: { isBillable: true } } }) : 0;

  const tiles: [string, number, string][] = [
    ["Open work orders", open, "/work-orders"],
    ["Electricians on the schedule today", crewToday.length, "/dispatch"],
    ["Timesheet entries to approve", timesheetsWaiting, "/timesheets"],
    ["Ready to invoice", readyToBill, "/work-orders"],
    ...(can(user.role, "projects:read") ? ([["Pending change orders", pendingCos, "/projects"]] as [string, number, string][]) : []),
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Dashboard" subtitle="What needs attention today." actions={can(user.role, "workorders:write") && <LinkButton href="/work-orders/new">+ New work order</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-md border-t-4 border-brand bg-white p-4 shadow-card hover:bg-amber-50/40">
            <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Urgent and high priority">
          {urgent.length === 0 ? (
            <p className="text-sm text-muted">Nothing urgent open.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {urgent.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link>
                  <span>{w.summary}</span>
                  <Badge color={w.priority.color}>{w.priority.label}</Badge>
                  <Badge color={w.status.color}>{w.status.label}</Badge>
                  <span className="w-full text-xs text-muted">{w.customer.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Not scheduled yet">
          {unscheduled.length === 0 ? (
            <p className="text-sm text-muted">Every open work order has a time.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {unscheduled.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link>
                  <span>{w.summary}</span>
                  {w.priority.code !== "NORMAL" && <Badge color={w.priority.color}>{w.priority.label}</Badge>}
                  <span className="w-full text-xs text-muted">{w.customer.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
