import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { recordRecentItem } from "@/server/recent";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("customers:read");
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: { category: true, paymentTerm: true, taxLevel: true, _count: { select: { jobSites: true, workOrders: true } } },
  });
  if (!c) notFound();
  await recordRecentItem(user.id, { entityType: "Customer", entityId: c.id, label: c.name, href: `/customers/${c.id}` });

  return (
    <RecordPage
      backHref="/customers"
      backLabel="Customers"
      title={c.name}
      fields={[
        { label: "Account", value: c.accountNumber },
        { label: "Category", value: c.category.label },
        { label: "Phone", value: c.phone },
        { label: "Email", value: c.email },
        { label: "Billing address", value: [c.billingStreet, c.billingCity, c.billingProvince, c.billingPostal].filter(Boolean).join(", ") },
        { label: "Terms", value: c.paymentTerm?.label },
        { label: "Tax level", value: c.taxLevel?.label },
        ...(c.taxExemptNumber ? [{ label: "Tax exemption no.", value: c.taxExemptNumber }] : []),
        { label: "Job sites / work orders", value: `${c._count.jobSites} / ${c._count.workOrders}` },
      ]}
    />
  );
}
