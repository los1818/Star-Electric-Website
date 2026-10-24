import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { param, type SearchParams } from "@/lib/list-params";
import { createWorkOrder } from "@/server/actions/work-orders";
import { workOrderFormOptions } from "../form-options";
import { WorkOrderForm } from "../work-order-form";

export const metadata = { title: "New work order" };

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageAccess("workorders:write");
  const sp = await searchParams;
  const options = await workOrderFormOptions();
  const [service, normal] = await Promise.all([
    db.workOrderType.findUnique({ where: { code: "SERVICE" }, select: { id: true } }),
    db.priority.findUnique({ where: { code: "NORMAL" }, select: { id: true } }),
  ]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="New work order" back={{ href: "/work-orders", label: "Work Orders" }} />
      <WorkOrderForm
        action={createWorkOrder}
        values={{ customerId: param(sp, "customerId") || null, jobSiteId: param(sp, "jobSiteId") || null, projectId: param(sp, "projectId") || null, typeId: service?.id, priorityId: normal?.id }}
        options={options}
        cancelHref="/work-orders"
      />
    </div>
  );
}
