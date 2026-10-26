"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { ROLES } from "@/lib/auth/permissions";
import { parsePeopleCsv, personFrom } from "@/lib/imports/people";
import { checkbox, requiredText } from "@/lib/validation";
import { audit } from "@/server/audit";
import { upsertPerson } from "@/server/imports/people";
import { ActionError, ValidationError, authorizedAction, authorizedFormAction } from "./authorized-action";

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

// --- Adding people -----------------------------------------------------------------------

const MAX_USERS_FILE_BYTES = 1024 * 1024;

/** Add one person. Electricians also get an employee record. Existing people: change access below instead. */
export const addUser = authorizedFormAction(
  "users:manage",
  z.object({
    name: requiredText("Name", 120),
    email: requiredText("Email", 200),
    role: z.enum(["ADMIN", "OFFICE", "TECHNICIAN"], { error: "Choose a role" }),
    electrician: checkbox,
  }),
  async (input, actor) => {
    let person;
    try {
      person = personFrom(input);
    } catch (error) {
      throw new ValidationError({ email: (error as Error).message });
    }
    if (await db.user.findUnique({ where: { email: person.email }, select: { id: true } })) {
      throw new ValidationError({ email: `${person.email} already has a login. Change their role or employee in the list below.` });
    }
    await db.$transaction(async (tx) => {
      const { userId } = await upsertPerson(tx, person);
      await audit(tx, actor.id, "create", "User", userId, { email: person.email, role: person.role, electrician: person.electrician });
    });
    revalidatePath("/settings/users");
    return { message: `${person.name} added. They can sign in as ${person.email}.` };
  },
);

/**
 * Add everyone in a users CSV (Name, User Name, Role[, Email]). People who already have a login keep
 * their role and status. Safe to repeat.
 */
export const importUsersFile = authorizedFormAction("users:manage", z.object({}), async (_input, actor, formData) => {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: "Choose the users file (.csv)" });
  if (file.size > MAX_USERS_FILE_BYTES) throw new ValidationError({ file: "That file is too large for a users list" });
  const { people, errors } = parsePeopleCsv(await file.text());
  if (errors.length) throw new ValidationError({ file: errors.slice(0, 5).join(" · ") + (errors.length > 5 ? ` (+${errors.length - 5} more)` : "") });
  if (!people.length) throw new ValidationError({ file: "No people found. The file needs columns Name, User Name and Role." });
  let created = 0;
  await db.$transaction(
    async (tx) => {
      for (const p of people) if ((await upsertPerson(tx, p)).outcome === "created") created++;
      await audit(tx, actor.id, "import_users", "User", actor.id, { file: file.name, count: people.length, created });
    },
    { timeout: 60_000 },
  );
  revalidatePath("/settings/users");
  const existing = people.length - created;
  return { message: `${created} added.${existing ? ` ${existing} already had a login and kept their role (change it in the list below).` : ""}` };
});
