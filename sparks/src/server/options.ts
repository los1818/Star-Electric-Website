import "server-only";
import { db } from "@/lib/db";
import type { LookupKey } from "@/lib/lookups";
import { listLookup } from "./lookups";

export interface Option {
  value: string;
  label: string;
}

/** Active rows of a lookup table as <select> options, plus the record's current value if it was deactivated. */
export async function lookupOptions(key: LookupKey, currentId?: string | null): Promise<Option[]> {
  const rows = await listLookup(key);
  return rows.filter((r) => r.active || r.id === currentId).map((r) => ({ value: r.id, label: r.active ? r.label : `${r.label} (inactive)` }));
}

export async function customerOptions(currentId?: string | null): Promise<Option[]> {
  const rows = await db.customer.findMany({
    where: { OR: [{ active: true }, ...(currentId ? [{ id: currentId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, accountNumber: true },
  });
  return rows.map((c) => ({ value: c.id, label: `${c.name} (${c.accountNumber})` }));
}

/** Default lookup row (e.g. the default tax level), for pre-filling new records. */
export async function defaultTaxLevelId(): Promise<string | null> {
  return (await db.taxLevel.findFirst({ where: { isDefault: true, active: true }, select: { id: true } }))?.id ?? null;
}
