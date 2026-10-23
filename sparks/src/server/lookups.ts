import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { LookupKey, LookupRecord, LookupRow } from "@/lib/lookups";
import { LOOKUP_TABLES } from "@/lib/lookups";

// Prisma delegates don't share a common TS type, so lookups go through this narrow shape.
interface LookupDelegate {
  findMany(args: object): Promise<LookupRecord[]>;
  findUnique(args: { where: { id: string } }): Promise<LookupRecord | null>;
  create(args: { data: Record<string, unknown> }): Promise<LookupRecord>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<LookupRecord>;
}

export function lookupDelegate(key: LookupKey, client: Prisma.TransactionClient = db): LookupDelegate {
  return client[LOOKUP_TABLES[key].model] as unknown as LookupDelegate;
}

const ORDER = [{ sortOrder: "asc" }, { label: "asc" }];

export async function listLookup(key: LookupKey, { activeOnly = false } = {}): Promise<LookupRow[]> {
  return lookupDelegate(key).findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: ORDER,
    select: { id: true, code: true, label: true, sortOrder: true, active: true },
  });
}

/** Full rows for the Settings editor (tax levels include their component ids). */
export async function listLookupRecords(key: LookupKey): Promise<LookupRecord[]> {
  if (key === "tax-levels") {
    const levels = await db.taxLevel.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { components: true } });
    return levels.map(({ components, ...l }) => ({ ...l, componentIds: components.map((c) => c.taxComponentId) }));
  }
  return lookupDelegate(key).findMany({ orderBy: ORDER });
}
