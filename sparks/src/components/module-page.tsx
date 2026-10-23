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
      <h1 className="text-2xl font-extrabold tracking-tight">{item.label}</h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-brand" aria-hidden />
      <p className="mt-3 text-sm text-muted">{item.description}</p>

      {values.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {values.map((s) => (
            <div key={s.label} className="rounded-md border-t-4 border-brand bg-white p-4 shadow-card">
              <dt className="text-xs uppercase tracking-wide text-gray-500">{s.label}</dt>
              <dd className="mt-1 text-2xl font-extrabold">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-6 rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
        This module is a placeholder. It&apos;s built in <strong>Phase {item.phase}</strong> (see docs/SPEC.md §8).
      </p>
    </div>
  );
}
