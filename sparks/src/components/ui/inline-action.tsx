"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormAction } from "@/server/actions/authorized-action";
import { buttonClass } from "./button";

function Submit({ label, variant, confirm }: { label: string; variant: "primary" | "dark" | "secondary" | "danger"; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, "sm")}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/** A one-button form (deactivate, delete, …) that shows the action's result next to it. */
export function InlineAction({
  action,
  fields,
  label,
  variant = "secondary",
  confirm,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "dark" | "secondary" | "danger";
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit label={label} variant={variant} confirm={confirm} />
      {state.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
      {state.ok && state.message && <span role="status" className="text-xs text-green-800">{state.message}</span>}
    </form>
  );
}
