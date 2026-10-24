"use client";

import { ActionForm, CheckboxField, SubmitButton, TextAreaField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

export function NoteForm({ action, workOrderId, allowCustomerVisible }: { action: FormAction; workOrderId: string; allowCustomerVisible: boolean }) {
  return (
    <ActionForm action={action} className="mt-4">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <TextAreaField name="body" label="Add a note" rows={3} />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <SubmitButton variant="dark">Add note</SubmitButton>
        {allowCustomerVisible && <CheckboxField name="customerVisible" label="Customer can see this" />}
      </div>
    </ActionForm>
  );
}
