import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Dispatch Board" };

export default function Page() {
  return (
    <ModulePage
      href="/dispatch"
      stats={async () => [
        { label: "Unscheduled", value: await db.workOrder.count({ where: { scheduledStart: null, status: { isClosed: false } } }) },
        { label: "Active technicians", value: await db.employee.count({ where: { active: true } }) },
      ]}
    />
  );
}
