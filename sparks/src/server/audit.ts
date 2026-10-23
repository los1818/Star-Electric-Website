import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Record who changed what. `diff` is the submitted values (create) or the changed fields (update). */
export async function audit(db: Db, userId: string, action: string, entityType: string, entityId: string, diff?: unknown) {
  await db.auditLog.create({
    data: { userId, action, entityType, entityId, diff: diff === undefined ? undefined : (JSON.parse(JSON.stringify(diff)) as Prisma.InputJsonValue) },
  });
}

/** Fields whose values differ between a record and an update payload. */
export function changedFields<T extends Record<string, unknown>>(before: Partial<T>, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const a = before[key];
    const b = after[key];
    const same = a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
    if (!same) out[key] = b;
  }
  return out;
}
