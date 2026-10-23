import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { reginaDayRange } from "@/lib/time";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <ModulePage
      href="/dashboard"
      stats={async (user) => {
        const scope = can(user.role, "workorders:read_all") ? {} : { assignments: { some: { employeeId: user.employeeId ?? "__none__" } } };
        const { start, end } = reginaDayRange(new Date());
        const [open, today] = await Promise.all([
          db.workOrder.count({ where: { ...scope, status: { isClosed: false } } }),
          db.workOrder.count({
            where: { ...scope, scheduledStart: { gte: start, lt: end } },
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
