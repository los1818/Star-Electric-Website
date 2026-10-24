"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/server/actions/authorized-action";

function Go() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
      {pending ? "Updating…" : "Update status"}
    </button>
  );
}

/** Pick the next status from the moves this user is allowed to make. */
export function StatusChanger({ action, workOrderId, options }: { action: FormAction; workOrderId: string; options: { value: string; label: string }[] }) {
  const [state, formAction] = useActionState(action, {});
  if (options.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={workOrderId} />
      <label htmlFor="next-status" className="sr-only">New status</label>
      <select id="next-status" name="statusId" className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm" defaultValue={options[0].value}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Go />
      {state.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
      {state.ok && <span role="status" className="text-xs text-green-800">{state.message}</span>}
    </form>
  );
}
