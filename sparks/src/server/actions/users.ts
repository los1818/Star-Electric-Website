"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/auth/permissions";
import { ActionError, authorizedAction } from "./authorized-action";

const updateUserAccessSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean(),
  employeeId: z.string().min(1).nullable(),
});

/** Assign a user's role, active flag and linked employee. Administrators only. */
export const updateUserAccess = authorizedAction("users:manage", updateUserAccessSchema, async (input, actor) => {
  // Don't let an administrator lock themselves out.
  if (input.userId === actor.id && (input.role !== "ADMIN" || !input.active)) {
    throw new ActionError("You can't remove your own administrator access.");
  }
  try {
    const user = await db.user.update({
      where: { id: input.userId },
      data: { role: input.role, active: input.active, employeeId: input.employeeId },
      select: { id: true, role: true, active: true, employeeId: true },
    });
    await db.auditLog.create({
      data: { userId: actor.id, action: "update_access", entityType: "User", entityId: user.id, diff: input },
    });
    revalidatePath("/settings/users");
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ActionError("That employee is already linked to another user.");
    }
    throw error;
  }
});
