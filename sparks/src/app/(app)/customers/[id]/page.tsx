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
import { formatCents } from "@/lib/money";
import { deleteContact, deleteCustomer, saveContact, setCustomerActive } from "@/server/actions/customers";
import { recordRecentItem } from "@/server/recent";
import { ContactForm } from "../contact-form";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("customers:read");
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      category: true,
      paymentTerm: true,
      taxLevel: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }], include: { jobSite: { select: { name: true } } } },
      jobSites: { orderBy: { name: "asc" }, select: { id: true, name: true, street: true, city: true, active: true } },
      workOrders: { orderBy: { requestedAt: "desc" }, take: 8, include: { status: true, type: true } },
      projects: { orderBy: { number: "desc" }, include: { status: true } },
    },
  });
  if (!c) notFound();
  await recordRecentItem(user.id, { entityType: "Customer", entityId: c.id, label: c.name, href: `/customers/${c.id}` });

  const canWrite = can(user.role, "customers:write");
  const canSeeBilling = can(user.role, "invoices:read");
  const openBalance = canSeeBilling
    ? await db.invoice.aggregate({ where: { customerId: id, status: { isPosted: true, code: { not: "VOID" } } }, _sum: { totalCents: true, paidCents: true } })
    : null;
  const balance = openBalance ? (openBalance._sum.totalCents ?? 0) - (openBalance._sum.paidCents ?? 0) : null;
  const siteOptions = c.jobSites.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="max-w-6xl">
      <RefreshRecentItems />
      <PageHeader
        title={<>{c.name} <ActiveBadge active={c.active} /></>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.accountNumber}</span>
            <Badge color={c.category.color}>{c.category.label}</Badge>
            {c.creditHold && <Badge color="#b91c1c">Credit hold</Badge>}
          </span>
        }
        back={{ href: "/customers", label: "Customers" }}
        actions={
          canWrite && (
            <>
              <LinkButton href={`/customers/${c.id}/edit`} variant="dark">Edit</LinkButton>
              <InlineAction
                action={setCustomerActive}
                fields={c.active ? { id: c.id } : { id: c.id, active: "on" }}
                label={c.active ? "Deactivate" : "Reactivate"}
                confirm={c.active ? "Deactivate this customer? They'll be hidden from lists; history is kept." : undefined}
              />
              {can(user.role, "customers:delete") && (
                <InlineAction action={deleteCustomer} fields={{ id: c.id }} label="Delete" variant="danger" confirm="Permanently delete this customer? This can't be undone." />
              )}
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DetailList
              items={[
                { label: "Phone", value: c.phone },
                { label: "Accounts email", value: c.email && <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> },
                { label: "Billing address", value: [c.billingStreet, [c.billingCity, c.billingProvince].filter(Boolean).join(", "), c.billingPostal].filter(Boolean).join("\n") },
                { label: "Website", value: c.website },
                { label: "Payment terms", value: c.paymentTerm?.label },
                { label: "Tax level", value: c.taxLevel?.label },
                ...(c.taxExemptNumber ? [{ label: "Tax exemption no.", value: c.taxExemptNumber }] : []),
                ...(balance !== null ? [{ label: "Open balance", value: formatCents(balance) }] : []),
                { label: "Notes", value: c.notes },
              ]}
            />
          </Card>

          <Card title={`Contacts (${c.contacts.length})`}>
            {c.contacts.length === 0 && <p className="text-sm text-muted">No contacts yet.</p>}
            <ul className="divide-y divide-gray-100">
              {c.contacts.map((ct) => (
                <li key={ct.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold">{ct.firstName} {ct.lastName}</span>
                      {ct.isPrimary && <span className="ml-2"><Badge color="#a16207">Primary</Badge></span>}
                      <div className="text-muted">{[ct.title, ct.jobSite?.name].filter(Boolean).join(" · ")}</div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-muted">
                        {ct.phone && <a href={`tel:${ct.phone}`} className="hover:underline">{ct.phone}</a>}
                        {ct.mobile && <a href={`tel:${ct.mobile}`} className="hover:underline">{ct.mobile} (mobile)</a>}
                        {ct.email && <a href={`mailto:${ct.email}`} className="hover:underline">{ct.email}</a>}
                      </div>
                    </div>
                    {canWrite && (
                      <InlineAction action={deleteContact} fields={{ id: ct.id }} label="Remove" variant="danger" confirm={`Remove ${ct.firstName} ${ct.lastName}?`} />
                    )}
                  </div>
                  {canWrite && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Edit contact</summary>
                      <ContactForm action={saveContact} customerId={c.id} sites={siteOptions} values={ct} />
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-ink hover:underline">+ Add contact</summary>
                <ContactForm action={saveContact} customerId={c.id} sites={siteOptions} />
              </details>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title={`Job sites (${c.jobSites.length})`}
            actions={can(user.role, "jobsites:write") && <LinkButton href={`/job-sites/new?customerId=${c.id}`} size="sm" variant="secondary">+ Add</LinkButton>}
          >
            {c.jobSites.length === 0 ? (
              <p className="text-sm text-muted">No job sites yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.jobSites.map((s) => (
                  <li key={s.id}>
                    <Link href={`/job-sites/${s.id}`} className="font-semibold hover:underline">{s.name}</Link> <ActiveBadge active={s.active} />
                    <div className="text-muted">{s.street}, {s.city}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {c.projects.length > 0 && can(user.role, "projects:read") && (
            <Card title="Projects">
              <ul className="space-y-2 text-sm">
                {c.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="font-semibold hover:underline">{p.number}</Link> {p.name}{" "}
                    <Badge color={p.status.color}>{p.status.label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Recent work orders">
            {c.workOrders.length === 0 ? (
              <EmptyState>No work orders yet.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.workOrders.map((w) => (
                  <li key={w.id}>
                    <Link href={`/work-orders/${w.id}`} className="font-semibold hover:underline">{w.number}</Link> {w.summary}
                    <div className="mt-0.5 flex gap-1">
                      <Badge color={w.status.color}>{w.status.label}</Badge>
                      <Badge color={w.type.color}>{w.type.label}</Badge>
                    </div>
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
