import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { recordRecentItem } from "@/server/recent";

export default async function JobSitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("jobsites:read");
  const { id } = await params;
  const s = await db.jobSite.findUnique({ where: { id }, include: { customer: true, taxLevel: true } });
  if (!s) notFound();
  await recordRecentItem(user.id, { entityType: "Job site", entityId: s.id, label: s.name, href: `/job-sites/${s.id}` });

  return (
    <RecordPage
      backHref="/job-sites"
      backLabel="Job Sites"
      title={s.name}
      fields={[
        { label: "Customer", value: s.customer.name },
        { label: "Address", value: `${s.street}, ${s.city}, ${s.province} ${s.postal ?? ""}` },
        { label: "Tax level", value: s.taxLevel?.label },
        { label: "Access notes", value: s.accessNotes },
      ]}
    />
  );
}
