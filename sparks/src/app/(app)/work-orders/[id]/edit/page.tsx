import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { toReginaDateTimeLocal } from "@/lib/time";
import { updateWorkOrder } from "@/server/actions/work-orders";
import { workOrderFormOptions } from "../../form-options";
import { WorkOrderForm } from "../../work-order-form";

export const metadata = { title: "Edit work order" };

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("workorders:write");
  const { id } = await params;
  const w = await db.workOrder.findUnique({ where: { id }, include: { assignments: true } });
  if (!w) notFound();
  const assigneeIds = w.assignments.map((a) => a.employeeId);
  const options = await workOrderFormOptions({ ...w, assigneeIds });
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${w.number}`} back={{ href: `/work-orders/${w.id}`, label: w.number }} />
      <WorkOrderForm
        action={updateWorkOrder}
        options={options}
        cancelHref={`/work-orders/${w.id}`}
        values={{
          ...w,
          notToExceed: w.notToExceedCents === null ? "" : (w.notToExceedCents / 100).toFixed(2),
          scheduledStart: w.scheduledStart ? toReginaDateTimeLocal(w.scheduledStart) : "",
          scheduledEnd: w.scheduledEnd ? toReginaDateTimeLocal(w.scheduledEnd) : "",
          assigneeIds,
          leadEmployeeId: w.assignments.find((a) => a.isLead)?.employeeId ?? null,
        }}
      />
    </div>
  );
}
