import { notFound } from "next/navigation";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList, EmptyState } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { setVendorActive } from "@/server/actions/people";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("vendors:read");
  const { id } = await params;
  const v = await db.vendor.findUnique({ where: { id }, include: { purchaseOrders: { orderBy: { number: "desc" }, take: 10, include: { status: true } } } });
  if (!v) notFound();
  const showPrices = can(user.role, "pricing:view");
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={<>{v.name} <ActiveBadge active={v.active} /></>}
        back={{ href: "/vendors", label: "Vendors" }}
        actions={
          can(user.role, "vendors:write") && (
            <>
              <LinkButton href={`/vendors/${v.id}/edit`} variant="dark">Edit</LinkButton>
              <InlineAction action={setVendorActive} fields={v.active ? { id: v.id } : { id: v.id, active: "on" }} label={v.active ? "Deactivate" : "Reactivate"} />
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <DetailList
            items={[
              { label: "Our account number", value: v.accountNumber },
              { label: "Contact / rep", value: v.contactName },
              { label: "Phone", value: v.phone },
              { label: "Orders email", value: v.email },
              { label: "Address", value: [v.street, [v.city, v.province].filter(Boolean).join(", "), v.postal].filter(Boolean).join("\n") },
            ]}
          />
        </Card>
        <Card title="Recent purchase orders">
          {v.purchaseOrders.length === 0 ? (
            <EmptyState>No purchase orders yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {v.purchaseOrders.map((po) => (
                <li key={po.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-semibold">{po.number}</span>
                  <Badge>{po.status.label}</Badge>
                  {showPrices && <span>{formatCents(po.totalCents)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
