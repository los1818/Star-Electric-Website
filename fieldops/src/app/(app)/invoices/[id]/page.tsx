import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { recordRecentItem } from "@/server/recent";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("invoices:read");
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id }, include: { customer: true, status: true, taxes: true } });
  if (!i) notFound();
  await recordRecentItem(user.id, { entityType: "Invoice", entityId: i.id, label: `${i.number} ${i.customer.name}`, href: `/invoices/${i.id}` });

  return (
    <RecordPage
      backHref="/invoices"
      backLabel="Invoices"
      title={i.number}
      fields={[
        { label: "Customer", value: i.customer.name },
        { label: "Status", value: i.status.label },
        { label: "Invoice date", value: i.invoiceDate.toISOString().slice(0, 10) },
        { label: "Subtotal", value: formatCents(i.subtotalCents) },
        ...i.taxes.map((t) => ({ label: t.label, value: formatCents(t.taxCents) })),
        { label: "Total", value: formatCents(i.totalCents) },
        { label: "Paid", value: formatCents(i.paidCents) },
      ]}
    />
  );
}
