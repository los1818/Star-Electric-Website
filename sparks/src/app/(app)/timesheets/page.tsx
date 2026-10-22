import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { formatHours } from "@/lib/money";

export const metadata = { title: "Timesheets" };

export default function Page() {
  return (
    <ModulePage
      href="/timesheets"
      stats={async (user) => {
        const scope = can(user.role, "timesheets:read_all") ? {} : { employeeId: user.employeeId ?? "__none__" };
        const sum = await db.timeEntry.aggregate({ where: scope, _sum: { hoursHundredths: true } });
        return [
          { label: "Time entries", value: await db.timeEntry.count({ where: scope }) },
          { label: "Hours", value: formatHours(sum._sum.hoursHundredths ?? 0) },
        ];
      }}
    />
  );
}
