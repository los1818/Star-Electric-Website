"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, FormGrid, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { Option } from "@/server/options";

export interface CustomerFormValues {
  id?: string;
  name?: string;
  categoryId?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  billingStreet?: string | null;
  billingCity?: string | null;
  billingProvince?: string | null;
  billingPostal?: string | null;
  paymentTermId?: string | null;
  taxLevelId?: string | null;
  taxExemptNumber?: string | null;
  creditHold?: boolean;
  notes?: string | null;
}

export function CustomerForm({
  action,
  values,
  options,
  cancelHref,
}: {
  action: FormAction;
  values: CustomerFormValues;
  options: { categories: Option[]; paymentTerms: Option[]; taxLevels: Option[] };
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="name" label="Customer name" defaultValue={values.name} required autoFocus className="sm:col-span-2" />
        <SelectField name="categoryId" label="Category" options={options.categories} defaultValue={values.categoryId} required blankLabel="Choose…" />
        <SelectField name="paymentTermId" label="Payment terms" options={options.paymentTerms} defaultValue={values.paymentTermId} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone} autoComplete="tel" />
        <TextField name="email" label="Accounts email" type="email" defaultValue={values.email} autoComplete="email" />
        <TextField name="website" label="Website" defaultValue={values.website} />
      </FormGrid>

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">Billing address</h2>
      <FormGrid>
        <TextField name="billingStreet" label="Street" defaultValue={values.billingStreet} autoComplete="street-address" className="sm:col-span-2" />
        <TextField name="billingCity" label="City" defaultValue={values.billingCity ?? "Regina"} />
        <div className="grid grid-cols-2 gap-4">
          <TextField name="billingProvince" label="Province" defaultValue={values.billingProvince ?? "SK"} maxLength={2} />
          <TextField name="billingPostal" label="Postal code" defaultValue={values.billingPostal} placeholder="S4P 3Y2" />
        </div>
      </FormGrid>

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">Tax and credit</h2>
      <FormGrid>
        <SelectField name="taxLevelId" label="Default tax level" options={options.taxLevels} defaultValue={values.taxLevelId} />
        <TextField name="taxExemptNumber" label="Tax exemption number" defaultValue={values.taxExemptNumber} hint="Required when the tax level is Exempt." />
        <CheckboxField name="creditHold" label="Credit hold" defaultChecked={values.creditHold} hint="Flags the customer on new work orders and quotes." />
      </FormGrid>

      <TextAreaField name="notes" label="Notes" defaultValue={values.notes} rows={4} className="mt-4" />

      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create customer"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">
          Cancel
        </Link>
      </FormActions>
    </ActionForm>
  );
}
