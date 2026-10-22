import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Inventory" };

export default function Page() {
  return <ModulePage href="/inventory" stats={async () => [{ label: "Items", value: await db.inventoryItem.count() }]} />;
}
