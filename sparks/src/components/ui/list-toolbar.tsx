import Link from "next/link";
import { buttonClass } from "./button";

export interface ToolbarFilter {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

/** Search box + filters as a plain GET form, so lists work without JavaScript and URLs are shareable. */
export function ListToolbar({ basePath, q, placeholder, filters = [] }: { basePath: string; q: string; placeholder: string; filters?: ToolbarFilter[] }) {
  const filtered = q || filters.some((f) => f.value);
  return (
    <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-2" role="search">
      <label className="min-w-56 flex-1">
        <span className="sr-only">Search</span>
        <input name="q" type="search" defaultValue={q} placeholder={placeholder} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
      </label>
      {filters.map((f) => (
        <label key={f.name} className="text-sm">
          <span className="sr-only">{f.label}</span>
          <select name={f.name} defaultValue={f.value} aria-label={f.label} className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm">
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button className={buttonClass("dark")}>Filter</button>
      {filtered && (
        <Link href={basePath} className="px-2 text-sm text-muted hover:underline">
          Clear
        </Link>
      )}
    </form>
  );
}
