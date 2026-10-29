import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { isStale } from "@/lib/inventory-pricing";
import { pageParams, param, type SearchParams } from "@/lib/list-params";
import { formatPercentBp } from "@/lib/markup";
import { adjustPricesByPercent, saveItemPrices } from "@/server/actions/inventory";
import { lookupOptions } from "@/server/options";
import { PRICE_AGE_OPTIONS, PRICE_UNIT_LABEL, inventoryWhere } from "@/lib/inventory-filters";
import { PercentForm, PriceGrid } from "./price-grid";

export const metadata = { title: "Update prices" };

const dollars = (cents: number) => (cents / 100).toFixed(2);

export default async function PricesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("inventory:write");
  // Pricing pages: both permissions (requirePageAccess alone allows "any of").
  if (!can(user.role, "pricing:view")) redirect("/forbidden");
  const sp = await searchParams;
  const q = param(sp, "q");
  const category = param(sp, "category");
  const age = param(sp, "age");
  const { page, pageSize, skip, take } = pageParams(sp, 50);
  const where = { ...inventoryWhere(sp), active: true };
  const [rows, total, categories] = await Promise.all([
    db.inventoryItem.findMany({ where, orderBy: [{ category: { sortOrder: "asc" } }, { description: "asc" }], skip, take }),
    db.inventoryItem.count({ where }),
    lookupOptions("inventory-categories"),
  ]);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Update prices"
        subtitle="Type new trade prices or discounts and save; the net cost updates as you type. Or move a whole category up or down by a percentage."
        back={{ href: "/inventory", label: "Inventory" }}
      />
      <ListToolbar
        basePath="/inventory/prices"
        q={q}
        placeholder="Search description, SKU, part number or manufacturer…"
        filters={[
          { name: "category", label: "Category", value: category, options: [{ value: "", label: "All categories" }, ...categories] },
          { name: "age", label: "Price date", value: age, options: PRICE_AGE_OPTIONS },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Card title={`Prices (${total} item${total === 1 ? "" : "s"})`}>
            {rows.length === 0 ? (
              <EmptyState>No items match those filters.</EmptyState>
            ) : (
              // Re-mount when the page or filters change. (Rows refresh themselves when their price changes.)
              <PriceGrid
                key={`${q}|${category}|${age}|${page}`}
                action={saveItemPrices}
                rows={rows.map((i) => ({
                  id: i.id,
                  description: i.description,
                  per: PRICE_UNIT_LABEL[i.priceUnit],
                  trade: dollars(i.tradePriceCents),
                  disc: i.discountBp ? formatPercentBp(i.discountBp).replace("%", "") : "0",
                  stale: isStale(i.priceDate),
                }))}
              />
            )}
            <Pagination basePath="/inventory/prices" params={{ q, category, age }} page={page} pageSize={pageSize} total={total} />
          </Card>
        </div>
        <div>
          <Card title="Adjust by percentage">
            <PercentForm action={adjustPricesByPercent} categories={categories} q={q} category={category} age={age} />
          </Card>
        </div>
      </div>
    </div>
  );
}
