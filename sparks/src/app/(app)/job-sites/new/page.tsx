import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/lib/auth/server";
import { param, type SearchParams } from "@/lib/list-params";
import { createJobSite } from "@/server/actions/job-sites";
import { customerOptions, lookupOptions } from "@/server/options";
import { SiteForm } from "../site-form";

export const metadata = { title: "New job site" };

export default async function NewJobSitePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageAccess("jobsites:write");
  const customerId = param(await searchParams, "customerId") || null;
  const [customers, taxLevels] = await Promise.all([customerOptions(), lookupOptions("tax-levels")]);
  const back = customerId ? { href: `/customers/${customerId}`, label: "Customer" } : { href: "/job-sites", label: "Job Sites" };
  return (
    <div className="max-w-3xl">
      <PageHeader title="New job site" back={back} />
      <SiteForm action={createJobSite} values={{ customerId }} options={{ customers, taxLevels }} cancelHref={back.href} />
    </div>
  );
}
