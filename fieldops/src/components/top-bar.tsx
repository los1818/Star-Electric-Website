import Link from "next/link";
import { signOut } from "@/auth";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { NEW_MENU_ITEMS } from "@/lib/nav";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export function TopBar({ user }: { user: CurrentUser }) {
  const newItems = NEW_MENU_ITEMS.filter((i) => can(user.role, i.permission));

  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
      <form action="/search" role="search" className="flex-1">
        <label htmlFor="global-search" className="sr-only">Search</label>
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="Search customers, sites, work orders, quotes, invoices…"
          className="w-full max-w-xl rounded border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white"
        />
      </form>

      {newItems.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-dark">
            + New
          </summary>
          <ul className="absolute right-0 z-10 mt-1 w-48 rounded border border-gray-200 bg-white py-1 shadow-lg">
            {newItems.map((i) => (
              <li key={i.type}>
                <Link href={`/new/${i.type}`} className="block px-3 py-1.5 text-sm hover:bg-gray-100">
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="relative">
        <summary className="cursor-pointer list-none rounded px-2 py-1.5 text-sm hover:bg-gray-100">
          {user.name ?? user.email} <span className="text-gray-500">· {ROLE_LABELS[user.role]}</span>
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-48 rounded border border-gray-200 bg-white py-1 shadow-lg">
          <p className="truncate px-3 py-1 text-xs text-gray-500">{user.email}</p>
          <form action={signOutAction}>
            <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">Sign out</button>
          </form>
        </div>
      </details>
    </header>
  );
}
