import Link from "next/link";
import { RefreshRecentItems } from "./refresh-recent-items";

export interface RecordField {
  label: string;
  value: React.ReactNode;
}

/** Read-only record summary used until each module's real detail page is built. */
export function RecordPage({ backHref, backLabel, title, fields }: { backHref: string; backLabel: string; title: string; fields: RecordField[] }) {
  return (
    <div className="max-w-3xl">
      <RefreshRecentItems />
      <Link href={backHref} className="text-sm text-gray-500 hover:underline">← {backLabel}</Link>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 rounded border border-gray-200 bg-white p-4 text-sm sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs uppercase tracking-wide text-gray-500">{f.label}</dt>
            <dd className="mt-0.5">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
