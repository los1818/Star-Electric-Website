import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { formatPercentBp, materialCostCents, suggestMarkupBp } from "@/lib/markup";
import { recordRecentItem } from "@/server/recent";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("quotes:read");
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, include: { customer: true, status: true, lines: true, _count: { select: { lines: true } } } });
  if (!q) notFound();
  const materialCost = materialCostCents(q.lines.map((l) => ({ ...l, quantity: l.quantity.toString() })));
  const suggested = suggestMarkupBp(materialCost, await db.markupTier.findMany());
  await recordRecentItem(user.id, { entityType: "Quote", entityId: q.id, label: `${q.number} ${q.title}`, href: `/quotes/${q.id}` });

  return (
    <RecordPage
      backHref="/quotes"
      backLabel="Quotes"
      title={`${q.number}: ${q.title}`}
      fields={[
        { label: "Customer", value: q.customer.name },
        { label: "Status", value: q.status.label },
        { label: "Lines", value: q._count.lines },
        { label: "Material cost", value: formatCents(materialCost) },
        {
          label: "Material markup",
          value: `${formatPercentBp(q.materialMarkupBp)}${suggested !== null && suggested !== q.materialMarkupBp ? ` (suggested ${formatPercentBp(suggested)})` : suggested !== null ? " (suggested)" : ""}`,
        },
        { label: "Subtotal", value: formatCents(q.subtotalCents) },
        { label: "Tax", value: formatCents(q.taxCents) },
        { label: "Total", value: formatCents(q.totalCents) },
      ]}
    />
  );
}
