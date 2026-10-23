import "server-only";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formDataToObject, type FieldErrors } from "@/lib/validation";
import { ForbiddenError, type Permission } from "@/lib/auth/permissions";
import { requireAuthenticated, requirePermission, type CurrentUser } from "@/lib/auth/server";

/** Throw from a handler to return a message to the user instead of a generic failure. */
export class ActionError extends Error {}

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
      if (error instanceof ActionError) return { ok: false, error: error.message };
      throw error;
    }
  };
}

/** State returned to a form by a form action (see src/components/ui/form.tsx). */
export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: FieldErrors;
  /** What was submitted, so the form can be re-filled after an error. */
  values?: Record<string, unknown>;
  /** Increments per submission so the form re-mounts with the submitted values. */
  attempt?: number;
}

export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Like authorizedAction, for <form action>: permission check, then Zod validation with
 * per-field errors, then the handler. Return { redirectTo } to navigate on success.
 */
export function authorizedFormAction<S extends z.ZodTypeAny>(
  permission: Permission | "authenticated",
  schema: S,
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<{ redirectTo?: string; message?: string } | void>,
): FormAction {
  return async (prev, formData) => {
    const values = formDataToObject(formData);
    const attempt = (prev.attempt ?? 0) + 1;
    let redirectTo: string | undefined;
    try {
      const user = permission === "authenticated" ? await requireAuthenticated() : await requirePermission(permission);
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error), values, attempt };
      }
      const result = await handler(parsed.data, user);
      if (!result?.redirectTo) return { ok: true, message: result?.message ?? "Saved", values, attempt };
      redirectTo = result.redirectTo;
    } catch (error) {
      if (error instanceof ForbiddenError) return { error: "You don't have permission to do that.", values, attempt };
      if (error instanceof ActionError) return { error: error.message, values, attempt };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { error: "That value is already used by another record.", values, attempt };
      }
      throw error;
    }
    redirect(redirectTo);
  };
}
