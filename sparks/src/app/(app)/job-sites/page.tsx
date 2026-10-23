import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ActiveBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { STATUS_OPTIONS, activeFilter, pageParams, param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Job Sites" };

export default async function JobSitesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("jobsites:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.JobSiteWhereInput = {
    ...activeFilter(sp),
    ...(q ? { OR: [{ name: contains }, { street: contains }, { city: contains }, { postal: contains }, { customer: { name: contains } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.jobSite.findMany({
      where,
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
      skip,
      take,
      include: { customer: { select: { id: true, name: true } }, _count: { select: { workOrders: true, equipment: true } } },
    }),
    db.jobSite.count({ where }),
  ]);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Job Sites"
        subtitle="Service locations for each customer."
        actions={can(user.role, "jobsites:write") && <LinkButton href="/job-sites/new">+ New job site</LinkButton>}
      />
      <ListToolbar basePath="/job-sites" q={q} placeholder="Search site, address, postal code or customer…" filters={[{ name: "status", label: "Status", value: param(sp, "status"), options: STATUS_OPTIONS }]} />
      <DataTable
        rows={rows}
        href={(s) => `/job-sites/${s.id}`}
        empty={q ? "No job sites match that search." : "No job sites yet."}
        columns={[
          { header: "Site", cell: (s) => <>{s.name} <ActiveBadge active={s.active} /></> },
          { header: "Customer", cell: (s) => <Link href={`/customers/${s.customer.id}`} className="hover:underline">{s.customer.name}</Link> },
          { header: "Address", cell: (s) => `${s.street}, ${s.city}` },
          { header: "Postal", cell: (s) => s.postal ?? "—" },
          { header: "Work orders", cell: (s) => s._count.workOrders, className: "text-right" },
          { header: "Equipment", cell: (s) => s._count.equipment, className: "text-right" },
        ]}
      />
      <Pagination basePath="/job-sites" params={{ q, status: param(sp, "status") }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
