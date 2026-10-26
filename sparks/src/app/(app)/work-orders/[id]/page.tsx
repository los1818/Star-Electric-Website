import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshRecentItems } from "@/components/refresh-recent-items";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { jobNumberOf } from "@/lib/job-numbers";
import { formatCents, formatHours, lineAmountCents } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import { InlineAction } from "@/components/ui/inline-action";
import { deleteAttachment, saveWorkOrderSignature, uploadWorkOrderPhotos } from "@/server/actions/attachments";
import { addWorkOrderNote, changeWorkOrderStatus } from "@/server/actions/work-orders";
import { recordRecentItem } from "@/server/recent";
import { allowedNextStatuses, findVisibleWorkOrder } from "@/server/work-orders";
import { PhotoUploadForm, SignatureForm } from "../attachment-forms";
import { NoteForm } from "../note-form";
import { StatusChanger } from "../status-changer";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("workorders:read_all", "workorders:read_assigned");
  const { id } = await params;
  // Technicians only find work orders assigned to them; anything else is "not found".
  const w = await findVisibleWorkOrder(user, id, {
    customer: { select: { id: true, name: true, phone: true, creditHold: true } },
    jobSite: true,
    contact: true,
    project: { select: { id: true, number: true, name: true, jobNumber: true } },
    type: true,
    status: true,
    priority: true,
    assignments: { include: { employee: { select: { id: true, firstName: true, lastName: true, phone: true } } }, orderBy: { isLead: "desc" } },
    notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    timeEntries: { include: { employee: { select: { firstName: true, lastName: true } }, itemType: true }, orderBy: { date: "desc" } },
    materials: { orderBy: { usedAt: "desc" } },
    scheduleEntries: { where: { endsAt: { gte: new Date(Date.now() - 86_400_000) } }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: { startsAt: "asc" } },
  });
  if (!w) notFound();
  await recordRecentItem(user.id, { entityType: "Work order", entityId: w.id, label: `${w.number} ${w.summary}`, href: `/work-orders/${w.id}` });

  const attachments = await db.attachment.findMany({
    where: { entityType: "WorkOrder", entityId: w.id, kind: { in: ["PHOTO", "SIGNATURE"] } },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const photos = attachments.filter((a) => a.kind === "PHOTO");
  const signatures = attachments.filter((a) => a.kind === "SIGNATURE");

  const canEdit = can(user.role, "workorders:write");
  const canAdd = can(user.role, "workorders:add_notes") && (!w.status.isClosed || canEdit);
  const showPrices = can(user.role, "pricing:view");
  const nextStatuses = can(user.role, "workorders:update_status") ? await allowedNextStatuses(user, w.statusId) : [];
  const totalHours = w.timeEntries.reduce((s, t) => s + t.hoursHundredths, 0);
  const address = `${w.jobSite.street}, ${w.jobSite.city}, ${w.jobSite.province} ${w.jobSite.postal ?? ""}`.trim();

  return (
    <div className="max-w-6xl">
      <RefreshRecentItems />
      <PageHeader
        title={`${w.number}: ${w.summary}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {jobNumberOf(w) && <span className="font-mono text-sm font-bold text-ink">Job {jobNumberOf(w)}</span>}
            <Badge color={w.status.color}>{w.status.label}</Badge>
            <Badge color={w.type.color}>{w.type.label}</Badge>
            <Badge color={w.priority.color}>{w.priority.label} priority</Badge>
            {w.project && (
              <Link href={`/projects/${w.project.id}`} className="text-xs font-semibold text-ink hover:underline">
                {w.project.number} {w.project.name}
              </Link>
            )}
          </span>
        }
        back={{ href: "/work-orders", label: "Work Orders" }}
        actions={canEdit && <LinkButton href={`/work-orders/${w.id}/edit`} variant="dark">Edit</LinkButton>}
      />

      {w.customer.creditHold && canEdit && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
          {w.customer.name} is on credit hold. Check with the office before doing more work.
        </p>
      )}

      {nextStatuses.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-white px-5 py-3 shadow-card">
          <span className="text-sm font-semibold">Move to:</span>
          <StatusChanger action={changeWorkOrderStatus} workOrderId={w.id} options={nextStatuses.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Job">
            <DetailList
              items={[
                { label: "Customer", value: can(user.role, "customers:read") ? <Link href={`/customers/${w.customer.id}`} className="font-semibold hover:underline">{w.customer.name}</Link> : w.customer.name },
                {
                  label: "Job site",
                  value: (
                    <>
                      {w.jobSite.name}
                      <br />
                      {address}{" "}
                      <a className="text-xs font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}>
                        Map
                      </a>
                    </>
                  ),
                },
                {
                  label: "Contact",
                  value: w.contact ? (
                    <>
                      {w.contact.firstName} {w.contact.lastName}
                      {[w.contact.phone, w.contact.mobile].filter(Boolean).map((p) => (
                        <a key={p} href={`tel:${p}`} className="block underline">{p}</a>
                      ))}
                    </>
                  ) : (
                    w.customer.phone && <a href={`tel:${w.customer.phone}`} className="underline">{w.customer.phone} (main line)</a>
                  ),
                },
                { label: "Planned", value: w.scheduledStart && `${formatDateTime(w.scheduledStart)}${w.scheduledEnd ? ` – ${formatTime(w.scheduledEnd)}` : ""}` },
                { label: "Customer PO", value: w.customerPoNumber },
                ...(showPrices ? [{ label: "Not-to-exceed", value: w.notToExceedCents === null ? null : formatCents(w.notToExceedCents) }] : []),
                { label: "Access notes", value: w.jobSite.accessNotes },
                { label: "Description", value: w.description },
              ]}
            />
          </Card>

          <Card title={`Notes (${w.notes.length})`}>
            {w.notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
            <ul className="space-y-3">
              {w.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <div className="text-xs text-muted">
                    {n.author.name ?? "Someone"} · {formatDateTime(n.createdAt)} {n.customerVisible && <Badge color="#2563eb">Customer can see</Badge>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-line">{n.body}</p>
                </li>
              ))}
            </ul>
            {can(user.role, "workorders:add_notes") && <NoteForm action={addWorkOrderNote} workOrderId={w.id} allowCustomerVisible={canEdit} />}
          </Card>

          <Card title={`Photos (${photos.length})`}>
            {photos.length === 0 ? (
              <p className="text-sm text-muted">No photos yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id} className="text-xs">
                    <a href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element -- served through the permission-checked route */}
                      <img src={`/api/attachments/${p.id}`} alt={p.caption ?? p.fileName} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    </a>
                    {p.caption && <p className="mt-1 font-semibold">{p.caption}</p>}
                    <p className="text-muted">{p.uploadedBy.name ?? "Someone"} · {formatDateTime(p.createdAt)}</p>
                    {canAdd && (canEdit || p.uploadedById === user.id) && <InlineAction action={deleteAttachment} fields={{ id: p.id }} label="Remove" confirm="Remove this photo?" />}
                  </li>
                ))}
              </ul>
            )}
            {canAdd && <PhotoUploadForm action={uploadWorkOrderPhotos} workOrderId={w.id} />}
          </Card>

          <Card title="Customer sign-off">
            {signatures.length === 0 ? (
              <p className="text-sm text-muted">Not signed yet.</p>
            ) : (
              <ul className="space-y-4">
                {signatures.map((s) => (
                  <li key={s.id} className="text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served through the permission-checked route */}
                    <img src={`/api/attachments/${s.id}`} alt={`Signature of ${s.signerName}`} className="h-24 max-w-full rounded-md border border-gray-200 bg-white" />
                    <p className="mt-1">
                      Signed by <span className="font-semibold">{s.signerName}</span> · {formatDateTime(s.createdAt)}
                      <span className="text-muted"> (collected by {s.uploadedBy.name ?? "someone"})</span>
                    </p>
                    {canEdit && <InlineAction action={deleteAttachment} fields={{ id: s.id }} label="Remove" confirm="Remove this signature?" />}
                  </li>
                ))}
              </ul>
            )}
            {canAdd && (
              <SignatureForm action={saveWorkOrderSignature} workOrderId={w.id} defaultSigner={w.contact ? `${w.contact.firstName} ${w.contact.lastName}` : undefined} />
            )}
          </Card>

          <Card title={`Time (${formatHours(totalHours)} h)`}>
            {w.timeEntries.length === 0 ? (
              <EmptyState>No time logged yet.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1 font-semibold">Date</th>
                    <th className="py-1 font-semibold">Who</th>
                    <th className="py-1 font-semibold">Type</th>
                    <th className="py-1 text-right font-semibold">Hours</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {w.timeEntries.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100">
                      <td className="py-1.5">{t.date.toISOString().slice(0, 10)}</td>
                      <td className="py-1.5">{t.employee.firstName} {t.employee.lastName}</td>
                      <td className="py-1.5">{t.itemType.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatHours(t.hoursHundredths)}</td>
                      <td className="py-1.5">{t.approvedAt ? <Badge color="#059669">Approved</Badge> : t.submittedAt ? <Badge color="#2563eb">Submitted</Badge> : <Badge>Draft</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={`Materials (${w.materials.length})`}>
            {w.materials.length === 0 ? (
              <EmptyState>No materials recorded yet.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1 font-semibold">Item</th>
                    <th className="py-1 text-right font-semibold">Qty</th>
                    {showPrices && <th className="py-1 text-right font-semibold">Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {w.materials.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="py-1.5">{m.description}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.quantity.toString()}</td>
                      {showPrices && <td className="py-1.5 text-right tabular-nums">{formatCents(lineAmountCents(m.quantity.toString(), m.unitCostCents, m.priceUnit))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Crew">
            {w.assignments.length === 0 ? (
              <p className="text-sm text-muted">Nobody assigned yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {w.assignments.map((a) => (
                  <li key={a.employeeId}>
                    <span className="font-semibold">{a.employee.firstName} {a.employee.lastName}</span> {a.isLead && <Badge color="#a16207">Lead</Badge>}
                    {a.employee.phone && <a href={`tel:${a.employee.phone}`} className="block text-muted hover:underline">{a.employee.phone}</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Schedule">
            {w.scheduleEntries.length === 0 ? (
              <p className="text-sm text-muted">Nothing on the schedule.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {w.scheduleEntries.map((s) => (
                  <li key={s.id}>
                    <span className="font-semibold">{formatDateTime(s.startsAt)}</span> – {formatTime(s.endsAt)}
                    <div className="text-muted">{s.employee.firstName} {s.employee.lastName}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="History">
            <DetailList
              items={[
                { label: "Requested", value: formatDateTime(w.requestedAt) },
                { label: "Completed", value: w.completedAt && formatDateTime(w.completedAt) },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
