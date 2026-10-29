import Link from "next/link";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { isStale } from "@/lib/inventory-pricing";
import { STATUS_OPTIONS, pageParams, param, type SearchParams } from "@/lib/list-params";
import { formatCents } from "@/lib/money";
import { formatPercentBp } from "@/lib/markup";
import { lookupOptions } from "@/server/options";
import { PRICE_AGE_OPTIONS, PRICE_UNIT_LABEL, inventoryWhere } from "@/lib/inventory-filters";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("inventory:read");
  const sp = await searchParams;
  const q = param(sp, "q");
  const category = param(sp, "category");
  const age = param(sp, "age");
  const status = param(sp, "status");
  const { page, pageSize, skip, take } = pageParams(sp);
  const showPrices = can(user.role, "pricing:view");
  const canEdit = can(user.role, "inventory:write") && showPrices;
  const where = inventoryWhere(sp, { pricing: showPrices });

  const [rows, total, categories, staleCount] = await Promise.all([
    db.inventoryItem.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { description: "asc" }],
      skip,
      take,
      include: { category: true, unit: true, stock: { select: { quantity: true } } },
    }),
    db.inventoryItem.count({ where }),
    lookupOptions("inventory-categories"),
    showPrices ? db.inventoryItem.count({ where: { ...inventoryWhere({ age: "stale" }) } }) : 0,
  ]);
  const imported = param(sp, "imported").match(/^(\d+)-(\d+)$/);
  const filterQuery = new URLSearchParams(Object.entries({ q, category, age, status }).filter(([, v]) => v)).toString();

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Inventory"
        subtitle={showPrices ? "Materials with Accubid pricing: trade price, discount and net cost, per each, per 100 or per 1000." : "Materials and stock."}
        actions={
          canEdit && (
            <span className="flex flex-wrap gap-2">
              <LinkButton href={`/inventory/prices${filterQuery ? `?${filterQuery}` : ""}`} variant="dark">Update prices</LinkButton>
              <LinkButton href="/inventory/import" variant="secondary">Import from Accubid</LinkButton>
              <LinkButton href="/inventory/new">+ New item</LinkButton>
            </span>
          )
        }
      />
      {imported && (
        <p role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Import done: {imported[1]} new item{imported[1] === "1" ? "" : "s"}, {imported[2]} price{imported[2] === "1" ? "" : "s"} updated.
        </p>
      )}
      {showPrices && staleCount > 0 && age !== "stale" && (
        <p className="mb-4 text-sm text-muted">
          {staleCount} item{staleCount === 1 ? "" : "s"} haven&apos;t had a price update in over a year.{" "}
          <Link href="/inventory?age=stale" className="font-semibold text-ink underline">Show them</Link>
        </p>
      )}
      <ListToolbar
        basePath="/inventory"
        q={q}
        placeholder="Search description, SKU, part number or manufacturer…"
        filters={[
          { name: "category", label: "Category", value: category, options: [{ value: "", label: "All categories" }, ...categories] },
          ...(showPrices ? [{ name: "age", label: "Price date", value: age, options: PRICE_AGE_OPTIONS }] : []),
          { name: "status", label: "Status", value: status, options: STATUS_OPTIONS },
        ]}
      />
      <DataTable
        rows={rows}
        href={(i) => `/inventory/${i.id}`}
        empty={q || category || age ? "No items match those filters." : "No inventory yet. Import it from Accubid."}
        columns={[
          { header: "Description", cell: (i) => <><span className="font-semibold">{i.description}</span> <ActiveBadge active={i.active} /></> },
          { header: "Category", cell: (i) => (i.category ? <Badge>{i.category.label}</Badge> : "—") },
          { header: "Stock", className: "text-right", cell: (i) => <span className="tabular-nums">{i.stock.reduce((s, x) => s + Number(x.quantity), 0).toLocaleString("en-CA")} {i.unit?.code.toLowerCase() ?? ""}</span> },
          ...(showPrices
            ? [
                { header: "Trade price", className: "text-right", cell: (i: (typeof rows)[number]) => <span className="tabular-nums">{formatCents(i.tradePriceCents)}</span> },
                { header: "Disc.", className: "text-right", cell: (i: (typeof rows)[number]) => (i.discountBp ? formatPercentBp(i.discountBp) : "—") },
                { header: "Net cost", className: "text-right", cell: (i: (typeof rows)[number]) => <span className="font-semibold tabular-nums">{formatCents(i.costCents)}</span> },
                { header: "Per", cell: (i: (typeof rows)[number]) => <span className="text-xs text-muted">{PRICE_UNIT_LABEL[i.priceUnit]}</span> },
                {
                  header: "Price date",
                  cell: (i: (typeof rows)[number]) => (
                    <span className={`whitespace-nowrap text-xs ${isStale(i.priceDate) ? "font-semibold text-red-700" : ""}`}>{i.priceDate ? i.priceDate.toISOString().slice(0, 10) : "Never"}</span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <Pagination basePath="/inventory" params={{ q, category, age, status }} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
