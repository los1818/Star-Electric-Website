"use client";

import { ActionForm, FormActions, FormGrid, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

export function SovLineForm({ action, projectId, line }: { action: FormAction; projectId: string; line?: { id: string; description: string; scheduledValueCents: number; sortOrder: number } }) {
  return (
    <ActionForm action={action} className="mt-2 rounded-md border border-gray-200 bg-surface/50 p-3">
      <input type="hidden" name="projectId" value={projectId} />
      {line && <input type="hidden" name="id" value={line.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_6rem]">
        <TextField name="description" label="Description" defaultValue={line?.description} required />
        <TextField name="scheduledValueCents" label="Value ($)" defaultValue={line ? (line.scheduledValueCents / 100).toFixed(2) : ""} required inputMode="decimal" />
        <TextField name="sortOrder" label="Order" type="number" min={0} defaultValue={String(line?.sortOrder ?? 100)} />
      </div>
      <FormActions>
        <SubmitButton variant="dark">{line ? "Save line" : "Add line"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ChangeOrderForm({ action, projectId }: { action: FormAction; projectId: string }) {
  return (
    <ActionForm action={action} className="mt-3 rounded-md border border-gray-200 bg-surface/50 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormGrid>
        <TextField name="title" label="Title" required className="sm:col-span-2" placeholder="e.g. Add two receptacles in room 204" />
        <TextField name="amountCents" label="Amount ($)" required inputMode="decimal" hint="Use a minus sign for a credit, e.g. -1500." />
        <TextField name="customerReference" label="Customer reference" hint="Their CO or RFI number." />
      </FormGrid>
      <TextAreaField name="description" label="Details" rows={3} className="mt-4" />
      <FormActions>
        <SubmitButton variant="dark">Add change order</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
