import Link from "next/link";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";
import { NEW_MENU_ITEMS } from "@/lib/nav";
import { signOutAction } from "@/server/actions/sign-out";

function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

export function TopBar({ user }: { user: CurrentUser }) {
  const newItems = NEW_MENU_ITEMS.filter((i) => can(user.role, i.permission));

  return (
    <header className="flex items-center gap-2 border-b-[3px] border-brand bg-white px-2 py-2 shadow-sm sm:gap-3 sm:px-4">
      <form action="/search" role="search" className="flex-1">
        <label htmlFor="global-search" className="sr-only">Search</label>
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="Search customers, contacts, sites, work orders, projects, invoices, people…"
          className="w-full max-w-xl rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white"
        />
      </form>

      {newItems.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer list-none whitespace-nowrap rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-ink hover:bg-brand-dark sm:px-4">
            + New
          </summary>
          <ul className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            {newItems.map((i) => (
              <li key={i.type}>
                <Link href={i.href} className="block px-3 py-1.5 text-sm hover:bg-gray-100">
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="relative">
        <summary className="cursor-pointer list-none rounded-md px-2 py-1.5 text-sm hover:bg-gray-100">
          <span className="hidden sm:inline">{user.name ?? user.email} </span>
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-brand sm:hidden" aria-label={user.name ?? user.email}>
            {initials(user.name ?? user.email)}
          </span>
          <span className="hidden text-gray-500 md:inline">· {ROLE_LABELS[user.role]}</span>
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <p className="truncate px-3 py-1 text-xs text-gray-500">{user.email}</p>
          <form action={signOutAction}>
            <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">Sign out</button>
          </form>
        </div>
      </details>
    </header>
  );
}
