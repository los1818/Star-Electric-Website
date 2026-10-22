import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Purchase Orders" };

export default function Page() {
  return <ModulePage href="/purchase-orders" stats={async () => [{ label: "Purchase orders", value: await db.purchaseOrder.count() }]} />;
}
