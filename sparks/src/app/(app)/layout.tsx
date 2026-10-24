import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { requirePageAccess } from "@/lib/auth/server";
import { visibleNavItems } from "@/lib/nav";
import { listRecentItems } from "@/server/recent";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageAccess();
  const recent = await listRecentItems(user.id);
  const items = visibleNavItems(user.role).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AppShell items={items} recent={recent.map(({ id, label, entityType, href }) => ({ id, label, entityType, href }))} topBar={<TopBar user={user} />}>
      {children}
    </AppShell>
  );
}
