import "server-only";
import { db } from "@/lib/db";
import type { LookupKey, LookupRow } from "@/lib/lookups";
import { LOOKUP_TABLES } from "@/lib/lookups";

// Prisma delegates don't share a common TS type, so lookups go through this narrow shape.
interface LookupDelegate {
  findMany(args: object): Promise<LookupRow[]>;
  update(args: { where: { id: string }; data: Partial<Omit<LookupRow, "id" | "code">> }): Promise<LookupRow>;
}

export function lookupDelegate(key: LookupKey): LookupDelegate {
  return db[LOOKUP_TABLES[key].model] as unknown as LookupDelegate;
}

export async function listLookup(key: LookupKey, { activeOnly = false } = {}): Promise<LookupRow[]> {
  return lookupDelegate(key).findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, code: true, label: true, sortOrder: true, active: true },
  });
}
