import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { param, type SearchParams } from "@/lib/list-params";
import { createProject } from "@/server/actions/projects";
import { projectFormOptions } from "../form-options";
import { ProjectForm } from "../project-form";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("projects:write");
  const sp = await searchParams;
  const [options, awarded] = await Promise.all([projectFormOptions(), db.projectStatus.findUnique({ where: { code: "AWARDED" }, select: { id: true } })]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New project" back={{ href: "/projects", label: "Projects" }} />
      <ProjectForm action={createProject} options={options} cancelHref="/projects" values={{ customerId: param(sp, "customerId") || null, statusId: awarded?.id, managerId: user.id }} />
    </div>
  );
}
