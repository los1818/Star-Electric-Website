import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Employees" };

export default function Page() {
  return <ModulePage href="/employees" stats={async () => [{ label: "Employees", value: await db.employee.count() }]} />;
}
