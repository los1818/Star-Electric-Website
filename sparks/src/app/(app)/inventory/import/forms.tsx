"use client";

import { ActionForm, CheckboxField, FieldError, FormActions, SubmitButton } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

export function UploadForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action}>
      <label htmlFor="accubid-file" className="mb-1 block text-sm font-semibold">Accubid inventory export (.xlsx)</label>
      <input id="accubid-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
      <FieldError name="file" />
      <FormActions>
        <SubmitButton>Check the file</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ConfirmForm({ action, file, fileName, stockDefault }: { action: FormAction; file: string; fileName: string; stockDefault: boolean }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="file" value={file} />
      <input type="hidden" name="fileName" value={fileName} />
      <CheckboxField
        name="updateStock"
        label="Also set warehouse stock to the quantities in the file"
        hint="Leave this off when you're only updating prices, so counts done in Sparks aren't overwritten."
        defaultChecked={stockDefault}
      />
      <FormActions>
        <SubmitButton>Import</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
