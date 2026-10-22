import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ForbiddenError, can, canAny, type Permission, type Role } from "./permissions";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  employeeId: string | null;
}

/**
 * The signed-in user, re-read from the database on every request so that a role change
 * or deactivation takes effect immediately, not when the session token expires.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true, employeeId: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, employeeId: user.employeeId };
});

/** For pages/layouts: redirect to login if signed out, to /forbidden if not permitted. */
export async function requirePageAccess(...permissions: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "PENDING") redirect("/pending");
  if (permissions.length > 0 && !canAny(user.role, permissions)) redirect("/forbidden");
  return user;
}

/** For server actions and route handlers: throws ForbiddenError. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("authenticated");
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}

export async function requireAuthenticated(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("authenticated");
  return user;
}
