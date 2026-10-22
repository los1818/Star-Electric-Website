"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { LOOKUP_KEYS } from "@/lib/lookups";
import { lookupDelegate } from "@/server/lookups";
import { authorizedAction } from "./authorized-action";

const updateLookupRowSchema = z.object({
  table: z.enum(LOOKUP_KEYS as [string, ...string[]]),
  id: z.string().min(1),
  label: z.string().trim().min(1, "Label is required").max(100),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean(),
});

/** Edit the shared columns of a lookup row. `code` is stable and never editable. */
export const updateLookupRow = authorizedAction("settings:manage", updateLookupRowSchema, async (input, user) => {
  const table = input.table as (typeof LOOKUP_KEYS)[number];
  const data = { label: input.label, sortOrder: input.sortOrder, active: input.active };
  const row = await lookupDelegate(table).update({ where: { id: input.id }, data });
  await db.auditLog.create({
    data: { userId: user.id, action: "update", entityType: `lookup:${table}`, entityId: row.id, diff: data },
  });
  revalidatePath(`/settings/${table}`);
  return row;
});
