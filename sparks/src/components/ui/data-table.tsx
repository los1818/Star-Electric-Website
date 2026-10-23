import Link from "next/link";
import { EmptyState } from "./card";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/** Server-rendered table; each row links to its record when `href` is given. */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  href,
  empty = "Nothing here yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  href?: (row: T) => string;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`px-4 py-2.5 font-semibold ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-amber-50/40">
              {columns.map((c, i) => (
                <td key={c.header} className={`px-4 py-2.5 align-top ${c.className ?? ""}`}>
                  {i === 0 && href ? (
                    <Link href={href(row)} className="font-semibold text-ink hover:underline">
                      {c.cell(row)}
                    </Link>
                  ) : (
                    c.cell(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
