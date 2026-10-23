import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { updateJobSite } from "@/server/actions/job-sites";
import { customerOptions, lookupOptions } from "@/server/options";
import { SiteForm } from "../../site-form";

export const metadata = { title: "Edit job site" };

export default async function EditJobSitePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("jobsites:write");
  const { id } = await params;
  const s = await db.jobSite.findUnique({ where: { id } });
  if (!s) notFound();
  const [customers, taxLevels] = await Promise.all([customerOptions(s.customerId), lookupOptions("tax-levels", s.taxLevelId)]);
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${s.name}`} back={{ href: `/job-sites/${s.id}`, label: s.name }} />
      <SiteForm action={updateJobSite} values={s} options={{ customers, taxLevels }} cancelHref={`/job-sites/${s.id}`} />
    </div>
  );
}
