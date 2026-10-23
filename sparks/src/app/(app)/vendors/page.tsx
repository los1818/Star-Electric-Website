import type { Prisma } from "@prisma/client";
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

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("vendors:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.VendorWhereInput = {
    ...activeFilter(sp),
    ...(q ? { OR: [{ name: contains }, { accountNumber: contains }, { contactName: contains }, { phone: contains }, { email: contains }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.vendor.findMany({ where, orderBy: { name: "asc" }, skip, take, include: { _count: { select: { purchaseOrders: true } } } }),
    db.vendor.count({ where }),
  ]);
  return (
    <div className="max-w-6xl">
      <PageHeader title="Vendors" subtitle="Suppliers and subcontractors." actions={can(user.role, "vendors:write") && <LinkButton href="/vendors/new">+ New vendor</LinkButton>} />
      <ListToolbar basePath="/vendors" q={q} placeholder="Search name, account, rep, phone or email…" filters={[{ name: "status", label: "Status", value: param(sp, "status"), options: STATUS_OPTIONS }]} />
      <DataTable
        rows={rows}
        href={(v) => `/vendors/${v.id}`}
        empty={q ? "No vendors match that search." : "No vendors yet."}
        columns={[
          { header: "Vendor", cell: (v) => <>{v.name} <ActiveBadge active={v.active} /></> },
          { header: "Our account", cell: (v) => v.accountNumber ?? "—" },
          { header: "Rep", cell: (v) => v.contactName ?? "—" },
          { header: "Phone", cell: (v) => v.phone ?? "—" },
          { header: "Purchase orders", cell: (v) => v._count.purchaseOrders, className: "text-right" },
        ]}
      />
      <Pagination basePath="/vendors" params={{ q, status: param(sp, "status") }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
