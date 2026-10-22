"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sortTiers, validateTiers } from "@/lib/markup";
import { ActionError, authorizedAction } from "./authorized-action";

const saveMarkupTiersSchema = z.object({
  tiers: z
    .array(z.object({ minMaterialCostCents: z.number().int(), markupBp: z.number().int() }))
    .max(20, "Use 20 tiers or fewer"),
});

/** Replace the whole set of markup tiers. Administrators only (settings:manage). */
export const saveMarkupTiers = authorizedAction("settings:manage", saveMarkupTiersSchema, async ({ tiers }, user) => {
  const errors = validateTiers(tiers);
  if (errors.length > 0) throw new ActionError(errors.join(" "));
  const sorted = sortTiers(tiers);
  await db.$transaction([db.markupTier.deleteMany(), db.markupTier.createMany({ data: sorted })]);
  await db.auditLog.create({
    data: { userId: user.id, action: "replace", entityType: "MarkupTier", entityId: "all", diff: { tiers: sorted } },
  });
  revalidatePath("/settings/markup-tiers");
  return sorted;
});
