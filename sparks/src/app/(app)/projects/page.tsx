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
import { formatCents } from "@/lib/money";
import { contractSummary } from "@/lib/progress-billing";
import { lookupOptions } from "@/server/options";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("projects:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.ProjectWhereInput = {
    ...(status === "all" ? {} : status ? { statusId: status } : { status: { isClosed: false } }),
    ...(q ? { OR: [{ number: contains }, { name: contains }, { contractNumber: contains }, { customerPoNumber: contains }, { customer: { name: contains } }] } : {}),
  };
  const [rows, total, statuses] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { number: "desc" },
      skip,
      take,
      include: { customer: { select: { id: true, name: true } }, status: true, changeOrders: { include: { status: true } }, _count: { select: { workOrders: true } } },
    }),
    db.project.count({ where }),
    lookupOptions("project-statuses"),
  ]);
  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Projects"
        subtitle="Contract jobs: contract value, change orders, schedule of values, progress billing and holdback."
        actions={can(user.role, "projects:write") && <LinkButton href="/projects/new">+ New project</LinkButton>}
      />
      <ListToolbar
        basePath="/projects"
        q={q}
        placeholder="Search number, name, contract, PO or customer…"
        filters={[{ name: "status", label: "Status", value: status, options: [{ value: "", label: "Open" }, { value: "all", label: "All statuses" }, ...statuses] }]}
      />
      <DataTable
        rows={rows}
        href={(p) => `/projects/${p.id}`}
        empty={q || status ? "No projects match those filters." : "No open projects."}
        columns={[
          { header: "Number", cell: (p) => <span className="font-mono text-xs">{p.number}</span> },
          { header: "Project", cell: (p) => <><div className="font-semibold">{p.name}</div><Link href={`/customers/${p.customer.id}`} className="text-xs text-muted hover:underline">{p.customer.name}</Link></> },
          { header: "Status", cell: (p) => <Badge color={p.status.color}>{p.status.label}</Badge> },
          {
            header: "Revised contract",
            className: "text-right",
            cell: (p) => formatCents(contractSummary(p.originalContractCents, p.changeOrders.filter((c) => !["REJECTED", "VOID"].includes(c.status.code)).map((c) => ({ amountCents: c.amountCents, approved: c.status.isApproved }))).revisedContractCents),
          },
          { header: "Pending COs", className: "text-right", cell: (p) => p.changeOrders.filter((c) => c.status.code === "PENDING").length || "—" },
          { header: "Work orders", className: "text-right", cell: (p) => p._count.workOrders },
        ]}
      />
      <Pagination basePath="/projects" params={{ q, status }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
