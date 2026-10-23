import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { updateEmployee } from "@/server/actions/people";
import { EmployeeForm } from "../../employee-form";
import { employeeFormOptions } from "../../options";

export const metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("employees:write");
  const { id } = await params;
  const e = await db.employee.findUnique({ where: { id } });
  if (!e) notFound();
  const name = `${e.firstName} ${e.lastName}`;
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${name}`} back={{ href: `/employees/${e.id}`, label: name }} />
      <EmployeeForm action={updateEmployee} values={e} options={await employeeFormOptions(user.role, e)} cancelHref={`/employees/${e.id}`} />
    </div>
  );
}
