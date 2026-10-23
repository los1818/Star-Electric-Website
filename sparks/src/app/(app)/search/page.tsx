import Link from "next/link";
import { requirePageAccess } from "@/lib/auth/server";
import { globalSearch } from "@/server/search";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePageAccess("search:use");
  const { q = "" } = await searchParams;
  const hits = await globalSearch(user, q);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Search</h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-brand" aria-hidden />
      {q.trim().length < 2 ? (
        <p className="mt-2 text-sm text-gray-600">Type at least two characters.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600">
            {hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”
          </p>
          <ul className="mt-4 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`}>
                <Link href={h.href} className="block px-4 py-2 hover:bg-gray-50">
                  <span className="mr-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{h.type}</span>
                  <span className="text-sm font-medium">{h.title}</span>
                  <span className="block text-xs text-gray-500">{h.subtitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
