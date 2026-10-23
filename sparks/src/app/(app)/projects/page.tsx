import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Projects" };

export default function Page() {
  return (
    <ModulePage
      href="/projects"
      stats={async () => [
        { label: "Projects", value: await db.project.count() },
        { label: "Open", value: await db.project.count({ where: { status: { isClosed: false } } }) },
        { label: "Pending change orders", value: await db.changeOrder.count({ where: { status: { code: "PENDING" } } }) },
      ]}
    />
  );
}
