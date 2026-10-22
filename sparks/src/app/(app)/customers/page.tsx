import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Customers" };

export default function Page() {
  return <ModulePage href="/customers" stats={async () => [{ label: "Customers", value: await db.customer.count() }]} />;
}
