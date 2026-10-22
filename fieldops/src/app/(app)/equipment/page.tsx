import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Equipment" };

export default function Page() {
  return <ModulePage href="/equipment" stats={async () => [{ label: "Equipment", value: await db.equipment.count() }]} />;
}
