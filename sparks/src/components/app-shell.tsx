"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavItem } from "@/lib/nav";
import { Sidebar, type SidebarRecentItem } from "./sidebar";

/**
 * Page frame. On large screens the sidebar is always visible; on phones and tablets it's a
 * slide-out drawer behind a ☰ button, closed again whenever the page changes.
 */
export function AppShell({
  items,
  recent,
  topBar,
  children,
}: {
  items: Pick<NavItem, "href" | "label" | "icon">[];
  recent: SidebarRecentItem[];
  topBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex h-full">
      <div className="hidden lg:flex">
        <Sidebar items={items} recent={recent} />
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex shadow-2xl">
            <Sidebar items={items} recent={recent} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="border-b-[3px] border-brand bg-white px-3 text-xl font-bold text-ink lg:hidden"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">{topBar}</div>
        </div>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
