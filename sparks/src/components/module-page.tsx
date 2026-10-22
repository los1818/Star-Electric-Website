import { requirePageAccess } from "@/lib/auth/server";
import { navItemFor } from "@/lib/nav";

export interface ModuleStat {
  label: string;
  value: number | string;
}

/**
 * Placeholder for a sidebar module that a later phase will build. Enforces the module's
 * permissions server-side, then shows what's coming and a few counts from the database.
 */
export async function ModulePage({ href, stats }: { href: string; stats?: (user: Awaited<ReturnType<typeof requirePageAccess>>) => Promise<ModuleStat[]> }) {
  const item = navItemFor(href);
  const user = await requirePageAccess(...item.permissions);
  const values = stats ? await stats(user) : [];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">{item.label}</h1>
      <p className="mt-1 text-sm text-gray-600">{item.description}</p>

      {values.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {values.map((s) => (
            <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4">
              <dt className="text-xs uppercase tracking-wide text-gray-500">{s.label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-6 rounded border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
        This module is a placeholder. It&apos;s built in <strong>Phase {item.phase}</strong> (see docs/SPEC.md §8).
      </p>
    </div>
  );
}
