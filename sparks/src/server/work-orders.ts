import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";

/** Work orders this user may see: all for office/admin, only assigned ones for technicians. */
export function workOrderScope(user: CurrentUser): Prisma.WorkOrderWhereInput {
  if (can(user.role, "workorders:read_all")) return {};
  return { assignments: { some: { employeeId: user.employeeId ?? "__no_employee__" } } };
}

export async function findVisibleWorkOrder<T extends Prisma.WorkOrderInclude>(user: CurrentUser, id: string, include: T) {
  return db.workOrder.findFirst({ where: { AND: [{ id }, workOrderScope(user)] }, include });
}

/**
 * Statuses this user may move a work order to from its current status. Allowed transitions come
 * from Settings (WorkOrderStatusTransition). Administrators may set any active status (to fix
 * mistakes); technicians may not close, cancel or mark invoiced.
 */
export async function allowedNextStatuses(user: CurrentUser, currentStatusId: string) {
  const all = await db.workOrderStatus.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (user.role === "ADMIN") return all.filter((s) => s.id !== currentStatusId);
  const transitions = await db.workOrderStatusTransition.findMany({ where: { fromId: currentStatusId }, select: { toId: true } });
  const allowed = new Set(transitions.map((t) => t.toId));
  return all.filter((s) => allowed.has(s.id) && (user.role !== "TECHNICIAN" || !["CLOSED", "CANCELLED", "INVOICED"].includes(s.code)));
}
