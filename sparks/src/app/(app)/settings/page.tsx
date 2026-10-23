import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { LOOKUP_KEYS, LOOKUP_TABLES, type LookupKey } from "@/lib/lookups";
import { listLookup } from "@/server/lookups";

export const metadata = { title: "Settings" };

const GROUPS: { title: string; keys: LookupKey[] }[] = [
  { title: "Money and tax", keys: ["tax-components", "tax-levels", "labor-rates", "timesheet-item-types", "payment-terms", "payment-methods"] },
  { title: "Work", keys: ["work-order-types", "work-order-statuses", "priorities", "project-statuses", "change-order-statuses"] },
  { title: "Sales and billing", keys: ["quote-statuses", "invoice-statuses", "purchase-order-statuses", "customer-categories"] },
  { title: "People, inventory and equipment", keys: ["trades", "inventory-categories", "units", "equipment-types"] },
];

function Tile({ href, title, detail }: { href: string; title: string; detail?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm hover:border-brand">
      <span className="font-semibold">{title}</span>
      {detail && <span className="text-muted">{detail}</span>}
    </Link>
  );
}

export default async function SettingsPage() {
  await requirePageAccess("settings:manage");
  const [pendingUsers, counts] = await Promise.all([
    db.user.count({ where: { role: "PENDING" } }),
    Promise.all(LOOKUP_KEYS.map(async (key) => [key, (await listLookup(key)).length] as const)).then((e) => new Map(e)),
  ]);
  // Fail loudly in development if a lookup table isn't in a group.
  const grouped = new Set(GROUPS.flatMap((g) => g.keys));
  const ungrouped = LOOKUP_KEYS.filter((k) => !grouped.has(k));

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Company details, users, pricing rules and the lists used throughout Sparks." />
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile href="/settings/company" title="Company information" detail="Name, address, GST #" />
        <Tile href="/settings/users" title="Users and roles" detail={pendingUsers > 0 ? <span className="rounded bg-amber-100 px-2 text-amber-800">{pendingUsers} awaiting</span> : undefined} />
        <Tile href="/settings/markup-tiers" title="Markup tiers" detail="By job size" />
      </div>
      {[...GROUPS, ...(ungrouped.length ? [{ title: "Other", keys: ungrouped }] : [])].map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{g.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.keys.map((key) => (
              <Tile key={key} href={`/settings/${key}`} title={LOOKUP_TABLES[key].label} detail={counts.get(key)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
