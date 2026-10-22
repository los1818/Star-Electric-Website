import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <ModulePage
      href="/dashboard"
      stats={async (user) => {
        const scope = can(user.role, "workorders:read_all") ? {} : { assignments: { some: { employeeId: user.employeeId ?? "__none__" } } };
        const [open, today] = await Promise.all([
          db.workOrder.count({ where: { ...scope, status: { isClosed: false } } }),
          db.workOrder.count({
            where: { ...scope, scheduledStart: { gte: startOfToday(), lt: startOfTomorrow() } },
          }),
        ]);
        return [
          { label: "Open work orders", value: open },
          { label: "Scheduled today", value: today },
        ];
      }}
    />
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}
