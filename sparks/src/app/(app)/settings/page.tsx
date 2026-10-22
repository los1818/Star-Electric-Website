import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { LOOKUP_KEYS, LOOKUP_TABLES } from "@/lib/lookups";
import { listLookup } from "@/server/lookups";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageAccess("settings:manage");
  const pendingUsers = await db.user.count({ where: { role: "PENDING" } });
  const counts = await Promise.all(LOOKUP_KEYS.map(async (key) => [key, (await listLookup(key)).length] as const));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Lookup tables used throughout Sparks. Labels, order and active flags can be edited here; type-specific fields
        (rates, multipliers, terms) get full editors in Phase 1.
      </p>
      <Link href="/settings/users" className="mt-6 flex justify-between rounded border border-gray-200 bg-white px-4 py-3 text-sm font-medium hover:border-brand">
        <span>Users and roles</span>
        {pendingUsers > 0 && <span className="rounded bg-amber-100 px-2 text-amber-800">{pendingUsers} awaiting access</span>}
      </Link>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Lookup tables</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {counts.map(([key, count]) => (
          <li key={key}>
            <Link href={`/settings/${key}`} className="flex justify-between rounded border border-gray-200 bg-white px-4 py-3 text-sm hover:border-brand">
              <span>{LOOKUP_TABLES[key].label}</span>
              <span className="text-gray-500">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
