import Link from "next/link";
import { notFound } from "next/navigation";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents, formatHours } from "@/lib/money";
import { setEmployeeActive } from "@/server/actions/people";
import { formatDateTime, formatTime } from "@/lib/time";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("employees:read");
  const { id } = await params;
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);
  const e = await db.employee.findUnique({
    where: { id },
    include: {
      trade: true,
      laborRate: true,
      user: { select: { email: true, role: true, active: true } },
      truck: { include: { _count: { select: { stock: true } } } },
      scheduleEntries: { where: { endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 10, include: { workOrder: { select: { id: true, number: true, summary: true } } } },
    },
  });
  if (!e) notFound();
  const recentHours = await db.timeEntry.aggregate({ where: { employeeId: id, date: { gte: twoWeeksAgo } }, _sum: { hoursHundredths: true } });
  const name = `${e.firstName} ${e.lastName}`;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={<>{name} <ActiveBadge active={e.active} /></>}
        subtitle={<span className="font-mono">{e.employeeNumber}</span>}
        back={{ href: "/employees", label: "Employees" }}
        actions={
          can(user.role, "employees:write") && (
            <>
              <LinkButton href={`/employees/${e.id}/edit`} variant="dark">Edit</LinkButton>
              <InlineAction action={setEmployeeActive} fields={e.active ? { id: e.id } : { id: e.id, active: "on" }} label={e.active ? "Deactivate" : "Reactivate"} />
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DetailList
              items={[
                { label: "Trade", value: e.trade?.label },
                { label: "Default labour rate", value: e.laborRate && (can(user.role, "pricing:view") ? `${e.laborRate.label} · ${formatCents(e.laborRate.sellCents)}/h` : e.laborRate.label) },
                { label: "Mobile", value: e.phone && <a href={`tel:${e.phone}`} className="underline">{e.phone}</a> },
                { label: "Email", value: e.email },
                { label: "Hire date", value: e.hireDate?.toISOString().slice(0, 10) },
                { label: "Hours, last 14 days", value: formatHours(recentHours._sum.hoursHundredths ?? 0) },
                { label: "Truck", value: e.truck ? `${e.truck.name} (${e.truck._count.stock} items stocked)` : null },
              ]}
            />
          </Card>
          <Card title="Upcoming schedule">
            {e.scheduleEntries.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {e.scheduleEntries.map((s) => (
                  <li key={s.id} className="py-2">
                    <span className="font-semibold">{formatDateTime(s.startsAt)}</span> – {formatTime(s.endsAt)}
                    {s.workOrder && (
                      <>
                        {" · "}
                        <Link href={`/work-orders/${s.workOrder.id}`} className="hover:underline">{s.workOrder.number}</Link> {s.workOrder.summary}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Sparks login">
          {e.user ? (
            <div className="text-sm">
              <div>{e.user.email}</div>
              <div className="mt-1"><Badge color="#2563eb">{ROLE_LABELS[e.user.role]}</Badge> {!e.user.active && <Badge color="#6b7280">Disabled</Badge>}</div>
            </div>
          ) : (
            <p className="text-sm text-muted">Not linked to a login. When this person signs in with their Star Electric Microsoft account, link them in Settings → Users.</p>
          )}
          {can(user.role, "users:manage") && <Link href="/settings/users" className="mt-3 inline-block text-xs font-semibold hover:underline">Manage users →</Link>}
        </Card>
      </div>
    </div>
  );
}
