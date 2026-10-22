import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Service Agreements" };

export default function Page() {
  return <ModulePage href="/service-agreements" stats={async () => [{ label: "Agreements", value: await db.serviceAgreement.count() }]} />;
}
