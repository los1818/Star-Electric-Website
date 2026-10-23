"use client";

import Link from "next/link";
import { ActionForm, FormActions, FormGrid, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { Option } from "@/server/options";

export interface SiteFormValues {
  id?: string;
  customerId?: string | null;
  name?: string;
  street?: string;
  city?: string;
  province?: string;
  postal?: string | null;
  accessNotes?: string | null;
  taxLevelId?: string | null;
}

export function SiteForm({ action, values, options, cancelHref }: { action: FormAction; values: SiteFormValues; options: { customers: Option[]; taxLevels: Option[] }; cancelHref: string }) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <SelectField name="customerId" label="Customer" options={options.customers} defaultValue={values.customerId} required blankLabel="Choose…" className="sm:col-span-2" />
        <TextField name="name" label="Site name" defaultValue={values.name} required placeholder="e.g. Main Building, Warehouse" className="sm:col-span-2" />
        <TextField name="street" label="Street" defaultValue={values.street} required autoComplete="street-address" className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={values.city ?? "Regina"} required />
        <div className="grid grid-cols-2 gap-4">
          <TextField name="province" label="Province" defaultValue={values.province ?? "SK"} required maxLength={2} />
          <TextField name="postal" label="Postal code" defaultValue={values.postal} placeholder="S4P 3Y2" />
        </div>
        <SelectField name="taxLevelId" label="Tax level" options={options.taxLevels} defaultValue={values.taxLevelId} blankLabel="Same as customer" hint="Only if this site is taxed differently from the customer." />
      </FormGrid>
      <TextAreaField name="accessNotes" label="Access notes" defaultValue={values.accessNotes} rows={4} hint="Parking, keys, lockbox, security desk, hours. Technicians see this on their work orders." className="mt-4" />
      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create job site"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}
