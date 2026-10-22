"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export interface SidebarRecentItem {
  id: string;
  label: string;
  entityType: string;
  href: string;
}

export function Sidebar({ items, recent }: { items: Pick<NavItem, "href" | "label" | "icon">[]; recent: SidebarRecentItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-gray-200">
      <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4 text-lg font-semibold text-white">
        <span className="text-brand" aria-hidden>★</span> Star FieldOps
      </Link>

      <nav aria-label="Modules" className="flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded px-3 py-1.5 text-sm ${
                    active ? "bg-brand font-medium text-ink" : "hover:bg-sidebar-hover hover:text-white"
                  }`}
                >
                  <span aria-hidden className="w-4 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="recent-heading" className="mt-6 border-t border-white/10 px-1 pt-3">
          <h2 id="recent-heading" className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Recent items
          </h2>
          {recent.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">Nothing opened yet.</p>
          ) : (
            <ul className="mt-1 space-y-0.5" data-testid="recent-items">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={r.href} className="block truncate rounded px-2 py-1 text-xs hover:bg-sidebar-hover hover:text-white" title={r.label}>
                    <span className="text-gray-400">{r.entityType}</span> {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </nav>
    </aside>
  );
}
