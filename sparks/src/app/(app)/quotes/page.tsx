import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Quotes" };

export default function Page() {
  return <ModulePage href="/quotes" stats={async () => [{ label: "Quotes", value: await db.quote.count() }]} />;
}
