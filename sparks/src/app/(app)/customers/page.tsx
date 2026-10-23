import type { Prisma } from "@prisma/client";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { STATUS_OPTIONS, activeFilter, pageParams, param, type SearchParams } from "@/lib/list-params";
import { lookupOptions } from "@/server/options";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("customers:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const category = param(sp, "category");
  const { page, pageSize, skip, take } = pageParams(sp);
  const contains = { contains: q, mode: "insensitive" as const };

  const where: Prisma.CustomerWhereInput = {
    ...activeFilter(sp),
    ...(category ? { categoryId: category } : {}),
    ...(q
      ? {
          OR: [
            { name: contains },
            { accountNumber: contains },
            { phone: contains },
            { email: contains },
            { billingStreet: contains },
            { contacts: { some: { OR: [{ firstName: contains }, { lastName: contains }, { email: contains }] } } },
          ],
        }
      : {}),
  };

  const [rows, total, categories] = await Promise.all([
    db.customer.findMany({ where, orderBy: { name: "asc" }, skip, take, include: { category: true, _count: { select: { jobSites: true } } } }),
    db.customer.count({ where }),
    lookupOptions("customer-categories"),
  ]);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Customers"
        subtitle="Customer accounts, contacts and billing details."
        actions={can(user.role, "customers:write") && <LinkButton href="/customers/new">+ New customer</LinkButton>}
      />
      <ListToolbar
        basePath="/customers"
        q={q}
        placeholder="Search name, account, phone, email, address or contact…"
        filters={[
          { name: "category", label: "Category", value: category, options: [{ value: "", label: "All categories" }, ...categories] },
          { name: "status", label: "Status", value: param(sp, "status"), options: STATUS_OPTIONS },
        ]}
      />
      <DataTable
        rows={rows}
        href={(c) => `/customers/${c.id}`}
        empty={q || category ? "No customers match those filters." : "No customers yet."}
        columns={[
          { header: "Name", cell: (c) => <>{c.name} <ActiveBadge active={c.active} /></> },
          { header: "Account", cell: (c) => <span className="font-mono text-xs">{c.accountNumber}</span> },
          { header: "Category", cell: (c) => <Badge color={c.category.color}>{c.category.label}</Badge> },
          { header: "Phone", cell: (c) => c.phone ?? "—" },
          { header: "City", cell: (c) => c.billingCity ?? "—" },
          { header: "Sites", cell: (c) => c._count.jobSites, className: "text-right" },
          { header: "", cell: (c) => (c.creditHold ? <Badge color="#b91c1c">Credit hold</Badge> : null) },
        ]}
      />
      <Pagination basePath="/customers" params={{ q, category, status: param(sp, "status") }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
