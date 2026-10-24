import "server-only";
import { db } from "@/lib/db";
import { lookupOptions } from "@/server/options";

export async function projectFormOptions(current?: { customerId: string; jobSiteId: string | null; statusId: string; taxLevelId: string | null; managerId: string | null }) {
  const [customers, sites, statuses, taxLevels, managers] = await Promise.all([
    db.customer.findMany({ where: { OR: [{ active: true }, ...(current ? [{ id: current.customerId }] : [])] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.jobSite.findMany({
      where: { OR: [{ active: true }, ...(current?.jobSiteId ? [{ id: current.jobSiteId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, street: true, customerId: true },
    }),
    lookupOptions("project-statuses", current?.statusId),
    lookupOptions("tax-levels", current?.taxLevelId),
    db.user.findMany({
      where: { OR: [{ active: true, role: { in: ["ADMIN", "OFFICE"] } }, ...(current?.managerId ? [{ id: current.managerId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return {
    customers: customers.map((c) => ({ value: c.id, label: c.name })),
    sites: sites.map((s) => ({ value: s.id, label: `${s.name}, ${s.street}`, customerId: s.customerId })),
    statuses,
    taxLevels,
    managers: managers.map((u) => ({ value: u.id, label: u.name ?? u.email })),
  };
}

export type ProjectFormOptions = Awaited<ReturnType<typeof projectFormOptions>>;
