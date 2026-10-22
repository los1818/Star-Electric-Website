import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { requirePageAccess } from "@/lib/auth/server";
import { visibleNavItems } from "@/lib/nav";
import { listRecentItems } from "@/server/recent";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageAccess();
  const recent = await listRecentItems(user.id);
  const items = visibleNavItems(user.role).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex h-full">
      <Sidebar items={items} recent={recent.map(({ id, label, entityType, href }) => ({ id, label, entityType, href }))} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
