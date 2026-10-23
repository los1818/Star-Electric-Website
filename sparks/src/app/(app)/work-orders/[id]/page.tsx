import { notFound } from "next/navigation";
import { RecordPage } from "@/components/record-page";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { recordRecentItem } from "@/server/recent";
import { formatDateTime } from "@/lib/time";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("workorders:read_all", "workorders:read_assigned");
  const { id } = await params;
  const w = await db.workOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      jobSite: true,
      type: true,
      status: true,
      priority: true,
      assignments: { include: { employee: true } },
    },
  });
  // Technicians may only see work orders assigned to them; treat others as not found.
  const assigned = w?.assignments.some((a) => a.employeeId === user.employeeId);
  if (!w || (!can(user.role, "workorders:read_all") && !assigned)) notFound();
  await recordRecentItem(user.id, { entityType: "Work order", entityId: w.id, label: `${w.number} ${w.summary}`, href: `/work-orders/${w.id}` });

  return (
    <RecordPage
      backHref="/work-orders"
      backLabel="Work Orders"
      title={`${w.number}: ${w.summary}`}
      fields={[
        { label: "Customer", value: w.customer.name },
        { label: "Job site", value: `${w.jobSite.name}, ${w.jobSite.street}` },
        { label: "Type", value: w.type.label },
        { label: "Status", value: w.status.label },
        { label: "Priority", value: w.priority.label },
        { label: "Scheduled", value: w.scheduledStart && formatDateTime(w.scheduledStart) },
        { label: "Assigned", value: w.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(", ") },
        { label: "Customer PO", value: w.customerPoNumber },
        { label: "Description", value: w.description },
      ]}
    />
  );
}
