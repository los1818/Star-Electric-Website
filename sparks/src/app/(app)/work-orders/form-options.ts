import "server-only";
import { db } from "@/lib/db";
import { lookupOptions } from "@/server/options";

export interface ScopedOption {
  value: string;
  label: string;
  customerId: string;
}

/** Everything the work order form's dropdowns need. `current` keeps inactive values of an existing WO selectable. */
export async function workOrderFormOptions(current?: { customerId: string; jobSiteId: string; typeId: string; priorityId: string; projectId: string | null; assigneeIds: string[] }) {
  const [customers, sites, contacts, projects, types, priorities, employees] = await Promise.all([
    db.customer.findMany({
      where: { OR: [{ active: true }, ...(current ? [{ id: current.customerId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, creditHold: true },
    }),
    db.jobSite.findMany({
      where: { OR: [{ active: true }, ...(current ? [{ id: current.jobSiteId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, street: true, customerId: true },
    }),
    db.contact.findMany({ orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, title: true, customerId: true } }),
    db.project.findMany({
      where: { OR: [{ status: { isClosed: false } }, ...(current?.projectId ? [{ id: current.projectId }] : [])] },
      orderBy: { number: "desc" },
      select: { id: true, number: true, name: true, customerId: true },
    }),
    lookupOptions("work-order-types", current?.typeId),
    lookupOptions("priorities", current?.priorityId),
    db.employee.findMany({
      where: { OR: [{ active: true }, ...(current?.assigneeIds.length ? [{ id: { in: current.assigneeIds } }] : [])] },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, trade: { select: { label: true } } },
    }),
  ]);
  return {
    customers: customers.map((c) => ({ value: c.id, label: c.creditHold ? `${c.name} (credit hold)` : c.name })),
    sites: sites.map((s) => ({ value: s.id, label: `${s.name}, ${s.street}`, customerId: s.customerId })),
    contacts: contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.title ? `, ${c.title}` : ""}`, customerId: c.customerId })),
    projects: projects.map((p) => ({ value: p.id, label: `${p.number} ${p.name}`, customerId: p.customerId })),
    types,
    priorities,
    employees: employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, detail: e.trade?.label ?? "" })),
  };
}

export type WorkOrderFormOptions = Awaited<ReturnType<typeof workOrderFormOptions>>;
