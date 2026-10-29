import { notFound } from "next/navigation";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { isStale } from "@/lib/inventory-pricing";
import { formatCents } from "@/lib/money";
import { formatPercentBp } from "@/lib/markup";
import { formatDateTime } from "@/lib/time";
import { PRICE_UNIT_LABEL } from "@/lib/inventory-filters";

const SOURCE_LABEL: Record<string, string> = { MANUAL: "Edited", PERCENT: "% adjustment", IMPORT: "Accubid import" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("inventory:read");
  const { id } = await params;
  const showPrices = can(user.role, "pricing:view");
  const i = await db.inventoryItem.findUnique({
    where: { id },
    include: {
      category: true,
      unit: true,
      stock: { include: { location: true }, orderBy: { location: { code: "asc" } } },
      // Prices are hidden from technicians, so their history is too.
      priceChanges: { include: { changedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: showPrices ? 50 : 0 },
    },
  });
  if (!i) notFound();
  const per = PRICE_UNIT_LABEL[i.priceUnit];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={i.description}
        subtitle={<span className="flex items-center gap-2"><span className="font-mono text-xs">{i.sku}</span> {i.category && <Badge>{i.category.label}</Badge>} <ActiveBadge active={i.active} /></span>}
        back={{ href: "/inventory", label: "Inventory" }}
        actions={can(user.role, "inventory:write") && showPrices && <LinkButton href={`/inventory/${i.id}/edit`} variant="dark">Edit</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {showPrices && (
            <Card title="Pricing">
              <DetailList
                items={[
                  { label: `Trade price (${per})`, value: formatCents(i.tradePriceCents) },
                  { label: "Discount", value: i.discountBp ? formatPercentBp(i.discountBp) : "None" },
                  { label: `Net cost (${per})`, value: <span className="font-bold">{formatCents(i.costCents)}</span> },
                  { label: "Price date", value: <span className={isStale(i.priceDate) ? "font-semibold text-red-700" : ""}>{i.priceDate ? i.priceDate.toISOString().slice(0, 10) : "Never"}</span> },
                  { label: "Estimating labour", value: i.noLabor ? "No labour" : i.laborHours ? `${i.laborHours.toString()} h ${PRICE_UNIT_LABEL[i.laborUnit]}` : null },
                ]}
              />
              <p className="mt-3 text-xs text-muted">Sell prices are set on each quote or invoice with that job&apos;s markup.</p>
            </Card>
          )}
          {showPrices && (
            <Card title="Price history">
              {i.priceChanges.length === 0 ? (
                <EmptyState>No price changes yet.</EmptyState>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 font-semibold">When</th>
                      <th className="py-1 font-semibold">How</th>
                      <th className="py-1 text-right font-semibold">Trade</th>
                      <th className="py-1 text-right font-semibold">Net cost</th>
                      <th className="py-1 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.priceChanges.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 align-top">
                        <td className="py-1.5 whitespace-nowrap">{formatDateTime(c.createdAt)}</td>
                        <td className="py-1.5">{SOURCE_LABEL[c.source] ?? c.source}{c.note && <div className="text-xs text-muted">{c.note}</div>}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatCents(c.oldTradePriceCents)} → {formatCents(c.newTradePriceCents)}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">{formatCents(c.oldCostCents)} → {formatCents(c.newCostCents)}</td>
                        <td className="py-1.5">{c.changedBy?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Stock">
            {i.stock.length === 0 ? (
              <p className="text-sm text-muted">None recorded.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {i.stock.map((s) => (
                  <li key={s.locationId} className="flex justify-between">
                    <span>{s.location.name}</span>
                    <span className="tabular-nums">{Number(s.quantity).toLocaleString("en-CA")} {i.unit?.code.toLowerCase() ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Details">
            <DetailList items={[{ label: "Manufacturer", value: i.manufacturer }, { label: "Part number", value: i.partNumber }, { label: "Unit", value: i.unit?.label }]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
