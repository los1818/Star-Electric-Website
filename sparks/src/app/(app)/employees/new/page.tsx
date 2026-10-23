import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/lib/auth/server";
import { createEmployee } from "@/server/actions/people";
import { EmployeeForm } from "../employee-form";
import { employeeFormOptions } from "../options";

export const metadata = { title: "New employee" };

export default async function NewEmployeePage() {
  const user = await requirePageAccess("employees:write");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New employee" back={{ href: "/employees", label: "Employees" }} />
      <EmployeeForm action={createEmployee} values={{}} options={await employeeFormOptions(user.role)} cancelHref="/employees" />
    </div>
  );
}
