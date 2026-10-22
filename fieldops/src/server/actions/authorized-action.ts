import "server-only";
import { z } from "zod";
import { ForbiddenError, type Permission } from "@/lib/auth/permissions";
import { requireAuthenticated, requirePermission, type CurrentUser } from "@/lib/auth/server";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Every server action goes through this: it checks the permission against the user's
 * current role in the database, validates the input with Zod, then runs the handler.
 */
export function authorizedAction<S extends z.ZodTypeAny, T>(
  permission: Permission | "authenticated",
  schema: S,
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input) => {
    try {
      const user = permission === "authenticated" ? await requireAuthenticated() : await requirePermission(permission);
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
      }
      return { ok: true, data: await handler(parsed.data, user) };
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return { ok: false, error: "You don't have permission to do that." };
      }
      throw error;
    }
  };
}
