import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Invoices" };

export default function Page() {
  return <ModulePage href="/invoices" stats={async () => [{ label: "Invoices", value: await db.invoice.count() }]} />;
}
