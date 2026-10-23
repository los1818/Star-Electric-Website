import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { formatPercentBp, materialCostCents, suggestMarkupBp } from "@/lib/markup";
import { recordRecentItem } from "@/server/recent";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("invoices:read");
  const { id } = await params;
  const i = await db.invoice.findUnique({ where: { id }, include: { customer: true, status: true, taxes: true, lines: true } });
  if (!i) notFound();
  const materialCost = materialCostCents(i.lines.map((l) => ({ ...l, quantity: l.quantity.toString() })));
  const suggested = suggestMarkupBp(materialCost, await db.markupTier.findMany());
  await recordRecentItem(user.id, { entityType: "Invoice", entityId: i.id, label: `${i.number} ${i.customer.name}`, href: `/invoices/${i.id}` });

  return (
    <RecordPage
      backHref="/invoices"
      backLabel="Invoices"
      title={i.number}
      fields={[
        { label: "Customer", value: i.customer.name },
        { label: "Status", value: i.status.label },
        ...(i.kind !== "STANDARD" ? [{ label: "Type", value: i.kind === "PROGRESS" ? "Progress claim" : "Holdback release" }] : []),
        { label: "Invoice date", value: i.invoiceDate.toISOString().slice(0, 10) },
        ...(i.kind === "STANDARD"
          ? [
              { label: "Material cost", value: formatCents(materialCost) },
              {
                label: "Material markup",
                value: `${formatPercentBp(i.materialMarkupBp)}${suggested !== null && suggested !== i.materialMarkupBp ? ` (suggested ${formatPercentBp(suggested)})` : suggested !== null ? " (suggested)" : ""}`,
              },
            ]
          : []),
        { label: i.kind === "PROGRESS" ? "Work this period" : "Subtotal", value: formatCents(i.subtotalCents) },
        ...(i.holdbackCents ? [{ label: `Holdback retained (${(i.holdbackBp / 100).toFixed(0)}%)`, value: formatCents(i.holdbackCents) }] : []),
        ...i.taxes.map((t) => ({ label: t.label, value: formatCents(t.taxCents) })),
        { label: i.holdbackCents ? "Amount due now" : "Total", value: formatCents(i.totalCents) },
        { label: "Paid", value: formatCents(i.paidCents) },
      ]}
    />
  );
}
