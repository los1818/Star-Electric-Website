import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList, EmptyState } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshRecentItems } from "@/components/refresh-recent-items";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { formatPercentBp } from "@/lib/markup";
import { formatCents } from "@/lib/money";
import { contractSummary } from "@/lib/progress-billing";
import { createChangeOrder, decideChangeOrder, deleteSovLine, saveSovLine } from "@/server/actions/projects";
import { recordRecentItem } from "@/server/recent";
import { ChangeOrderForm, SovLineForm } from "../project-forms";

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
      sovLines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { progressLines: true } },
      invoices: { select: { id: true, number: true, kind: true, holdbackCents: true, totalCents: true, invoiceDate: true, status: { select: { label: true, color: true } } }, orderBy: { invoiceDate: "asc" } },
      workOrders: { include: { status: true }, orderBy: { number: "desc" } },
    },
  });
  if (!p) notFound();
  await recordRecentItem(user.id, { entityType: "Project", entityId: p.id, label: `${p.number} ${p.name}`, href: `/projects/${p.id}` });

  const canWrite = can(user.role, "projects:write");
  const canBill = can(user.role, "projects:billing");
  const live = p.changeOrders.filter((c) => !["REJECTED", "VOID"].includes(c.status.code));
  const contract = contractSummary(p.originalContractCents, live.map((c) => ({ amountCents: c.amountCents, approved: c.status.isApproved })));
  const lines = p.sovLines.map((l) => {
    const billed = l.progressLines.reduce((s, pl) => s + pl.thisPeriodCents, 0);
    return { ...l, billed, pct: l.scheduledValueCents ? Math.round((billed / l.scheduledValueCents) * 1000) / 10 : 0 };
  });
  const sovTotal = lines.reduce((s, l) => s + l.scheduledValueCents, 0);
  const billedToDate = lines.reduce((s, l) => s + l.billed, 0);
  const holdbackHeld = p.invoices.reduce((sum, i) => sum + (i.kind === "HOLDBACK_RELEASE" ? -i.holdbackCents : i.holdbackCents), 0);
  const sovMismatch = sovTotal !== contract.revisedContractCents;

  return (
    <div className="max-w-6xl">
      <RefreshRecentItems />
      <PageHeader
        title={`${p.number}: ${p.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {p.jobNumber && <span className="font-mono text-sm font-bold text-ink">Job {p.jobNumber}</span>}
            <Badge color={p.status.color}>{p.status.label}</Badge>
            <Link href={`/customers/${p.customer.id}`} className="font-semibold text-ink hover:underline">{p.customer.name}</Link>
          </span>
        }
        back={{ href: "/projects", label: "Projects" }}
        actions={
          <>
            {can(user.role, "workorders:write") && <LinkButton href={`/work-orders/new?customerId=${p.customerId}${p.jobSiteId ? `&jobSiteId=${p.jobSiteId}` : ""}&projectId=${p.id}`}>+ Work order</LinkButton>}
            {canWrite && <LinkButton href={`/projects/${p.id}/edit`} variant="dark">Edit</LinkButton>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Original contract", formatCents(contract.originalContractCents)],
          ["Approved COs", formatCents(contract.approvedChangeOrdersCents)],
          ["Revised contract", formatCents(contract.revisedContractCents)],
          ["Billed to date", `${formatCents(billedToDate)}${contract.revisedContractCents ? ` (${Math.round((billedToDate / contract.revisedContractCents) * 100)}%)` : ""}`],
          [`Holdback held (${formatPercentBp(p.holdbackBp)})`, formatCents(holdbackHeld)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border-t-4 border-brand bg-white p-4 shadow-card">
            <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Schedule of values">
            {sovMismatch && lines.length > 0 && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Lines total {formatCents(sovTotal)}, but the revised contract is {formatCents(contract.revisedContractCents)}. Adjust the lines so progress claims add up to the contract.
              </p>
            )}
            {lines.length === 0 ? (
              <EmptyState>No schedule of values yet. Break the contract into lines so progress claims can bill against them.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 font-semibold">Line</th>
                      <th className="py-1 text-right font-semibold">Scheduled</th>
                      <th className="py-1 text-right font-semibold">Billed</th>
                      <th className="py-1 text-right font-semibold">%</th>
                      <th className="py-1 text-right font-semibold">To finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100 align-top">
                        <td className="py-2">
                          {l.description}
                          {canWrite && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Edit</summary>
                              <SovLineForm action={saveSovLine} projectId={p.id} line={l} />
                              {l.progressLines.length === 0 && (
                                <div className="mt-2"><InlineAction action={deleteSovLine} fields={{ id: l.id }} label="Remove line" variant="danger" confirm="Remove this line?" /></div>
                              )}
                            </details>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatCents(l.scheduledValueCents)}</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(l.billed)}</td>
                        <td className="py-2 text-right tabular-nums">{l.pct}%</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(l.scheduledValueCents - l.billed)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 font-bold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right tabular-nums">{formatCents(sovTotal)}</td>
                      <td className="py-2 text-right tabular-nums">{formatCents(billedToDate)}</td>
                      <td className="py-2 text-right tabular-nums">{sovTotal ? Math.round((billedToDate / sovTotal) * 1000) / 10 : 0}%</td>
                      <td className="py-2 text-right tabular-nums">{formatCents(sovTotal - billedToDate)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {canWrite && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold hover:underline">+ Add line</summary>
                <SovLineForm action={saveSovLine} projectId={p.id} />
              </details>
            )}
          </Card>

          <Card title={`Change orders (${p.changeOrders.length})`}>
            {p.changeOrders.length === 0 && <p className="text-sm text-muted">No change orders yet.</p>}
            <ul className="divide-y divide-gray-100">
              {p.changeOrders.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{c.number}</span>
                    <span className="font-semibold">{c.title}</span>
                    <span className="tabular-nums">{formatCents(c.amountCents)}</span>
                    <Badge color={c.status.color}>{c.status.label}</Badge>
                    {c.customerReference && <span className="text-xs text-muted">Ref {c.customerReference}</span>}
                  </div>
                  {c.description && <p className="mt-1 whitespace-pre-line text-muted">{c.description}</p>}
                  {canBill && c.status.code === "PENDING" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <InlineAction action={decideChangeOrder} fields={{ id: c.id, decision: "APPROVED", addToSov: "on" }} label="Approve + add to schedule" variant="primary" />
                      <InlineAction action={decideChangeOrder} fields={{ id: c.id, decision: "APPROVED" }} label="Approve only" />
                      <InlineAction action={decideChangeOrder} fields={{ id: c.id, decision: "REJECTED" }} label="Reject" variant="danger" confirm={`Reject ${c.number}?`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold hover:underline">+ Add change order</summary>
                <ChangeOrderForm action={createChangeOrder} projectId={p.id} />
              </details>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <DetailList
              items={[
                { label: "Job site", value: p.jobSite && <Link href={`/job-sites/${p.jobSite.id}`} className="hover:underline">{p.jobSite.name}, {p.jobSite.street}</Link> },
                { label: "Project manager", value: p.manager?.name },
                { label: "Contract number", value: p.contractNumber },
                { label: "Customer PO", value: p.customerPoNumber },
                { label: "Start", value: p.startDate?.toISOString().slice(0, 10) },
                { label: "Substantial completion", value: p.substantialCompletion?.toISOString().slice(0, 10) },
                { label: "Notes", value: p.notes },
              ]}
            />
          </Card>
          <Card title={`Work orders (${p.workOrders.length})`}>
            {p.workOrders.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.workOrders.map((w) => (
                  <li key={w.id}>
                    <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link> {w.summary} <Badge color={w.status.color}>{w.status.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can(user.role, "invoices:read") && (
            <Card title="Progress claims">
              {p.invoices.length === 0 ? (
                <p className="text-sm text-muted">No invoices yet. Creating progress claims comes with invoicing (Phase 4).</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {p.invoices.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/invoices/${i.id}`} className="font-semibold hover:underline">{i.number}</Link>
                      <span className="tabular-nums">{formatCents(i.totalCents)}</span>
                      <Badge color={i.status.color}>{i.status.label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
