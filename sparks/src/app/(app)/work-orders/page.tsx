import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Work Orders" };

export default function Page() {
  return (
    <ModulePage
      href="/work-orders"
      stats={async (user) => {
        const scope = can(user.role, "workorders:read_all") ? {} : { assignments: { some: { employeeId: user.employeeId ?? "__none__" } } };
        return [
          { label: can(user.role, "workorders:read_all") ? "Work orders" : "Assigned to me", value: await db.workOrder.count({ where: scope }) },
          { label: "Open", value: await db.workOrder.count({ where: { ...scope, status: { isClosed: false } } }) },
        ];
      }}
    />
  );
}
