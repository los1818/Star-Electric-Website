import Link from "next/link";
import { notFound } from "next/navigation";
import { ActiveBadge, Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, DetailList, EmptyState } from "@/components/ui/card";
import { InlineAction } from "@/components/ui/inline-action";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshRecentItems } from "@/components/refresh-recent-items";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { deleteJobSite, setJobSiteActive } from "@/server/actions/job-sites";
import { recordRecentItem } from "@/server/recent";

export default async function JobSitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("jobsites:read");
  const { id } = await params;
  const s = await db.jobSite.findUnique({
    where: { id },
    include: {
      customer: { include: { taxLevel: true } },
      taxLevel: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      equipment: { where: { active: true }, include: { type: true }, orderBy: { name: "asc" } },
      workOrders: { orderBy: { requestedAt: "desc" }, take: 10, include: { status: true, type: true } },
    },
  });
  if (!s) notFound();
  await recordRecentItem(user.id, { entityType: "Job site", entityId: s.id, label: s.name, href: `/job-sites/${s.id}` });
  const address = `${s.street}, ${s.city}, ${s.province} ${s.postal ?? ""}`.trim();
  const canWrite = can(user.role, "jobsites:write");

  return (
    <div className="max-w-6xl">
      <RefreshRecentItems />
      <PageHeader
        title={<>{s.name} <ActiveBadge active={s.active} /></>}
        subtitle={<Link href={`/customers/${s.customer.id}`} className="font-semibold text-ink hover:underline">{s.customer.name}</Link>}
        back={{ href: "/job-sites", label: "Job Sites" }}
        actions={
          canWrite && (
            <>
              {can(user.role, "workorders:write") && s.active && <LinkButton href={`/work-orders/new?customerId=${s.customer.id}&jobSiteId=${s.id}`}>+ Work order</LinkButton>}
              <LinkButton href={`/job-sites/${s.id}/edit`} variant="dark">Edit</LinkButton>
              <InlineAction action={setJobSiteActive} fields={s.active ? { id: s.id } : { id: s.id, active: "on" }} label={s.active ? "Deactivate" : "Reactivate"} />
              {can(user.role, "jobsites:delete") && (
                <InlineAction action={deleteJobSite} fields={{ id: s.id }} label="Delete" variant="danger" confirm="Permanently delete this job site?" />
              )}
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Site">
            <DetailList
              items={[
                {
                  label: "Address",
                  value: (
                    <>
                      {address}{" "}
                      <a className="ml-1 text-xs font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}>
                        Map
                      </a>
                    </>
                  ),
                },
                { label: "Tax level", value: s.taxLevel ? s.taxLevel.label : `${s.customer.taxLevel?.label ?? "Default"} (from customer)` },
                { label: "Access notes", value: s.accessNotes },
              ]}
            />
          </Card>
          <Card title="Recent work orders">
            {s.workOrders.length === 0 ? (
              <EmptyState>No work orders at this site yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {s.workOrders.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link>
                    <span>{w.summary}</span>
                    <Badge color={w.status.color}>{w.status.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Site contacts" actions={can(user.role, "customers:write") && <Link href={`/customers/${s.customer.id}`} className="text-xs font-semibold hover:underline">Manage</Link>}>
            {s.contacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts for this site. Customer-wide contacts are on the customer page.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.contacts.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{c.firstName} {c.lastName}</span> {c.title && <span className="text-muted">· {c.title}</span>}
                    <div className="text-muted">{[c.phone, c.mobile, c.email].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Equipment (${s.equipment.length})`}>
            {s.equipment.length === 0 ? (
              <p className="text-sm text-muted">No equipment recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.equipment.map((e) => (
                  <li key={e.id}>
                    <span className="font-semibold">{e.name}</span> <span className="text-muted">· {e.type.label}</span>
                    <div className="text-muted">{[e.manufacturer, e.model, e.voltage, e.amperage].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
