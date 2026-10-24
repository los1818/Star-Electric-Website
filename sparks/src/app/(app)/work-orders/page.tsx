import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { pageParams, param, type SearchParams } from "@/lib/list-params";
import { formatDateTime } from "@/lib/time";
import { lookupOptions } from "@/server/options";
import { workOrderScope } from "@/server/work-orders";

export const metadata = { title: "Work Orders" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("workorders:read_all", "workorders:read_assigned");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status"); // "" = open, "all", or a status id
  const type = param(sp, "type");
  const assignee = param(sp, "assignee");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };
  const seesAll = can(user.role, "workorders:read_all");

  const where: Prisma.WorkOrderWhereInput = {
    AND: [
      workOrderScope(user),
      status === "all" ? {} : status ? { statusId: status } : { status: { isClosed: false } },
      type ? { typeId: type } : {},
      assignee ? { assignments: { some: { employeeId: assignee } } } : {},
      q
        ? {
            OR: [
              { number: contains },
              { summary: contains },
              { customerPoNumber: contains },
              { customer: { name: contains } },
              { jobSite: { OR: [{ name: contains }, { street: contains }] } },
            ],
          }
        : {},
    ],
  };

  const [rows, total, statuses, types, employees] = await Promise.all([
    db.workOrder.findMany({
      where,
      orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      skip,
      take,
      include: {
        customer: { select: { id: true, name: true } },
        jobSite: { select: { name: true, street: true } },
        status: true,
        type: true,
        priority: true,
        assignments: { include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { isLead: "desc" } },
      },
    }),
    db.workOrder.count({ where }),
    lookupOptions("work-order-statuses"),
    lookupOptions("work-order-types"),
    seesAll ? db.employee.findMany({ where: { active: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);

  return (
    <div className="max-w-7xl">
      <PageHeader
        title={seesAll ? "Work Orders" : "My Work Orders"}
        subtitle={seesAll ? "Service calls, projects, maintenance and inspections." : "Work orders you're assigned to."}
        actions={can(user.role, "workorders:write") && <LinkButton href="/work-orders/new">+ New work order</LinkButton>}
      />
      <ListToolbar
        basePath="/work-orders"
        q={q}
        placeholder="Search number, summary, customer, site, address or PO…"
        filters={[
          { name: "status", label: "Status", value: status, options: [{ value: "", label: "Open" }, { value: "all", label: "All statuses" }, ...statuses] },
          { name: "type", label: "Type", value: type, options: [{ value: "", label: "All types" }, ...types] },
          ...(seesAll
            ? [{ name: "assignee", label: "Assigned to", value: assignee, options: [{ value: "", label: "Anyone" }, ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))] }]
            : []),
        ]}
      />
      <DataTable
        rows={rows}
        href={(w) => `/work-orders/${w.id}`}
        empty={q || status || type || assignee ? "No work orders match those filters." : "No open work orders."}
        columns={[
          { header: "Number", cell: (w) => <span className="whitespace-nowrap font-mono text-xs">{w.number}</span> },
          {
            header: "Summary",
            cell: (w) => (
              <div className="min-w-56">
                <div className="font-semibold">{w.summary}</div>
                <div className="text-xs text-muted">
                  <Link href={`/customers/${w.customer.id}`} className="hover:underline">{w.customer.name}</Link> · {w.jobSite.street}
                </div>
              </div>
            ),
          },
          { header: "Status", cell: (w) => <Badge color={w.status.color}>{w.status.label}</Badge> },
          { header: "Type", cell: (w) => <Badge color={w.type.color}>{w.type.label}</Badge> },
          { header: "Priority", cell: (w) => <Badge color={w.priority.color}>{w.priority.label}</Badge> },
          { header: "Planned", cell: (w) => <span className="whitespace-nowrap text-xs">{w.scheduledStart ? formatDateTime(w.scheduledStart) : "Not scheduled"}</span> },
          { header: "Crew", cell: (w) => <span className="text-xs">{w.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName[0]}.`).join(", ") || "—"}</span> },
        ]}
      />
      <Pagination basePath="/work-orders" params={{ q, status, type, assignee }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
