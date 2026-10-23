import Link from "next/link";

/** Previous/next links that keep the current filters. */
export function Pagination({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      {pages > 1 && (
        <span className="flex gap-3">
          {page > 1 ? <Link href={href(page - 1)} className="font-semibold text-ink hover:underline">← Previous</Link> : <span className="opacity-40">← Previous</span>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)} className="font-semibold text-ink hover:underline">Next →</Link> : <span className="opacity-40">Next →</span>}
        </span>
      )}
    </nav>
  );
}
