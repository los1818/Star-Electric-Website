import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/server";

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const PER_TYPE = 8;

/**
 * Global search across the record types the user may read. Simple case-insensitive
 * substring matching for Phase 0; Phase 1 replaces it with Postgres full-text search.
 */
export async function globalSearch(user: CurrentUser, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const hits: SearchHit[] = [];

  if (can(user.role, "customers:read")) {
    const customers = await db.customer.findMany({
      where: { OR: [{ name: contains }, { accountNumber: contains }, { phone: contains }] },
      take: PER_TYPE,
      orderBy: { name: "asc" },
    });
    hits.push(...customers.map((c) => ({ type: "Customer", id: c.id, title: c.name, subtitle: c.accountNumber, href: `/customers/${c.id}` })));
  }

  if (can(user.role, "jobsites:read")) {
    const sites = await db.jobSite.findMany({
      where: { OR: [{ name: contains }, { street: contains }, { postal: contains }] },
      include: { customer: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { name: "asc" },
    });
    hits.push(...sites.map((s) => ({ type: "Job site", id: s.id, title: s.name, subtitle: `${s.street}, ${s.city} (${s.customer.name})`, href: `/job-sites/${s.id}` })));
  }

  const canAllWo = can(user.role, "workorders:read_all");
  if (canAllWo || can(user.role, "workorders:read_assigned")) {
    const scope = canAllWo ? {} : { assignments: { some: { employeeId: user.employeeId ?? "__none__" } } };
    const workOrders = await db.workOrder.findMany({
      where: { AND: [scope, { OR: [{ number: contains }, { summary: contains }, { customerPoNumber: contains }, { jobSite: { street: contains } }] }] },
      include: { customer: { select: { name: true } }, status: { select: { label: true } } },
      take: PER_TYPE,
      orderBy: { number: "desc" },
    });
    hits.push(...workOrders.map((w) => ({ type: "Work order", id: w.id, title: `${w.number}: ${w.summary}`, subtitle: `${w.customer.name} · ${w.status.label}`, href: `/work-orders/${w.id}` })));
  }

  if (can(user.role, "quotes:read")) {
    const quotes = await db.quote.findMany({
      where: { OR: [{ number: contains }, { title: contains }, { customer: { name: contains } }] },
      include: { customer: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { number: "desc" },
    });
    hits.push(...quotes.map((x) => ({ type: "Quote", id: x.id, title: `${x.number}: ${x.title}`, subtitle: x.customer.name, href: `/quotes/${x.id}` })));
  }

  if (can(user.role, "invoices:read")) {
    const invoices = await db.invoice.findMany({
      where: { OR: [{ number: contains }, { customerPoNumber: contains }, { customer: { name: contains } }] },
      include: { customer: { select: { name: true } } },
      take: PER_TYPE,
      orderBy: { number: "desc" },
    });
    hits.push(...invoices.map((i) => ({ type: "Invoice", id: i.id, title: i.number, subtitle: i.customer.name, href: `/invoices/${i.id}` })));
  }

  return hits;
}
