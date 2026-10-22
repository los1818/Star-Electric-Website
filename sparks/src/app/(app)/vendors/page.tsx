import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Vendors" };

export default function Page() {
  return <ModulePage href="/vendors" stats={async () => [{ label: "Vendors", value: await db.vendor.count() }]} />;
}
