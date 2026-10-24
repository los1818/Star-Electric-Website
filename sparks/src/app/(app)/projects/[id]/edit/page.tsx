import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { formatPercentBp } from "@/lib/markup";
import { updateProject } from "@/server/actions/projects";
import { projectFormOptions } from "../../form-options";
import { ProjectForm } from "../../project-form";

export const metadata = { title: "Edit project" };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("projects:write");
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${p.number}`} back={{ href: `/projects/${p.id}`, label: p.number }} />
      <ProjectForm
        action={updateProject}
        options={await projectFormOptions(p)}
        cancelHref={`/projects/${p.id}`}
        values={{
          ...p,
          originalContract: (p.originalContractCents / 100).toFixed(2),
          holdback: formatPercentBp(p.holdbackBp).replace("%", ""),
          startDate: day(p.startDate),
          substantialCompletion: day(p.substantialCompletion),
        }}
      />
    </div>
  );
}
