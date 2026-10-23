import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import { formatPercentBp } from "@/lib/markup";
import { contractSummary } from "@/lib/progress-billing";
import { recordRecentItem } from "@/server/recent";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("projects:read");
  const { id } = await params;
  const p = await db.project.findUnique({
    where: { id },
    include: {
      customer: true,
      jobSite: true,
      status: true,
      manager: true,
      changeOrders: { include: { status: true }, orderBy: { number: "asc" } },
      sovLines: { orderBy: { sortOrder: "asc" }, include: { progressLines: true } },
      invoices: { select: { holdbackCents: true, kind: true } },
      _count: { select: { workOrders: true } },
    },
  });
  if (!p) notFound();
  await recordRecentItem(user.id, { entityType: "Project", entityId: p.id, label: `${p.number} ${p.name}`, href: `/projects/${p.id}` });

  const contract = contractSummary(
    p.originalContractCents,
    p.changeOrders.filter((c) => c.status.code !== "REJECTED" && c.status.code !== "VOID").map((c) => ({ amountCents: c.amountCents, approved: c.status.isApproved })),
  );
  const billedToDate = p.sovLines.reduce((sum, l) => sum + l.progressLines.reduce((s, pl) => s + pl.thisPeriodCents, 0), 0);
  const holdbackHeld = p.invoices.reduce((sum, i) => sum + (i.kind === "HOLDBACK_RELEASE" ? -i.holdbackCents : i.holdbackCents), 0);

  return (
    <RecordPage
      backHref="/projects"
      backLabel="Projects"
      title={`${p.number}: ${p.name}`}
      fields={[
        { label: "Customer", value: p.customer.name },
        { label: "Job site", value: p.jobSite ? `${p.jobSite.name}, ${p.jobSite.street}` : null },
        { label: "Status", value: p.status.label },
        { label: "Project manager", value: p.manager?.name },
        { label: "Original contract", value: formatCents(contract.originalContractCents) },
        { label: "Approved change orders", value: formatCents(contract.approvedChangeOrdersCents) },
        { label: "Revised contract", value: formatCents(contract.revisedContractCents) },
        { label: "Pending change orders", value: formatCents(contract.pendingChangeOrdersCents) },
        { label: "Billed to date", value: formatCents(billedToDate) },
        { label: "Holdback", value: `${formatPercentBp(p.holdbackBp)} · ${formatCents(holdbackHeld)} held` },
        { label: "Work orders", value: p._count.workOrders },
        {
          label: "Change orders",
          value: p.changeOrders.length ? p.changeOrders.map((c) => `${c.number} ${c.title} (${formatCents(c.amountCents)}, ${c.status.label})`).join("; ") : "None",
        },
      ]}
    />
  );
}
