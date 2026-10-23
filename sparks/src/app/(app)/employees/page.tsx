import type { Prisma } from "@prisma/client";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { STATUS_OPTIONS, activeFilter, pageParams, param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("employees:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.EmployeeWhereInput = {
    ...activeFilter(sp),
    ...(q ? { OR: [{ firstName: contains }, { lastName: contains }, { employeeNumber: contains }, { phone: contains }, { email: contains }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.employee.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip, take, include: { trade: true, user: { select: { role: true } } } }),
    db.employee.count({ where }),
  ]);
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Employees"
        subtitle="Electricians, apprentices and office staff."
        actions={can(user.role, "employees:write") && <LinkButton href="/employees/new">+ New employee</LinkButton>}
      />
      <ListToolbar basePath="/employees" q={q} placeholder="Search name, number, phone or email…" filters={[{ name: "status", label: "Status", value: param(sp, "status"), options: STATUS_OPTIONS }]} />
      <DataTable
        rows={rows}
        href={(e) => `/employees/${e.id}`}
        empty={q ? "No employees match that search." : "No employees yet."}
        columns={[
          { header: "Name", cell: (e) => <>{e.lastName}, {e.firstName} <ActiveBadge active={e.active} /></> },
          { header: "Number", cell: (e) => <span className="font-mono text-xs">{e.employeeNumber}</span> },
          { header: "Trade", cell: (e) => e.trade?.label ?? "—" },
          { header: "Phone", cell: (e) => e.phone ?? "—" },
          { header: "Sparks login", cell: (e) => (e.user ? <Badge color="#2563eb">{ROLE_LABELS[e.user.role]}</Badge> : <span className="text-muted">None</span>) },
        ]}
      />
      <Pagination basePath="/employees" params={{ q, status: param(sp, "status") }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
