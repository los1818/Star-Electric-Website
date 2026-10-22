import { ModulePage } from "@/components/module-page";
import { db } from "@/lib/db";

export const metadata = { title: "Job Sites" };

export default function Page() {
  return <ModulePage href="/job-sites" stats={async () => [{ label: "Job sites", value: await db.jobSite.count() }]} />;
}
