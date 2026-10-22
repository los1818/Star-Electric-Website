import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { recordRecentItem } from "@/server/recent";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("quotes:read");
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, include: { customer: true, status: true, _count: { select: { lines: true } } } });
  if (!q) notFound();
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
        { label: "Material markup", value: `${(q.materialMarkupBp / 100).toFixed(1)}%` },
        { label: "Subtotal", value: formatCents(q.subtotalCents) },
        { label: "Tax", value: formatCents(q.taxCents) },
        { label: "Total", value: formatCents(q.totalCents) },
      ]}
    />
  );
}
