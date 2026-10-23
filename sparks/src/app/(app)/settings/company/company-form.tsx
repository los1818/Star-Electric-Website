"use client";

import { ActionForm, FormActions, FormGrid, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { CompanyField } from "@/lib/company";
import { saveCompanySettings } from "@/server/actions/settings";

export function CompanyForm({ values }: { values: Partial<Record<CompanyField, string>> }) {
  return (
    <ActionForm action={saveCompanySettings} className="rounded-md bg-white p-6 shadow-card">
      <FormGrid>
        <TextField name="companyName" label="Company name" defaultValue={values.companyName} required className="sm:col-span-2" />
        <TextField name="companyStreet" label="Street" defaultValue={values.companyStreet} className="sm:col-span-2" />
        <TextField name="companyCity" label="City" defaultValue={values.companyCity} />
        <div className="grid grid-cols-2 gap-4">
          <TextField name="companyProvince" label="Province" defaultValue={values.companyProvince} maxLength={2} />
          <TextField name="companyPostal" label="Postal code" defaultValue={values.companyPostal} />
        </div>
        <TextField name="companyPhone" label="Phone" type="tel" defaultValue={values.companyPhone} />
        <TextField name="companyEmail" label="Email" type="email" defaultValue={values.companyEmail} />
        <TextField name="gstNumber" label="GST/HST registration number" defaultValue={values.gstNumber} hint="Printed on every invoice (CRA requires it)." />
        <TextField name="pstNumber" label="SK PST vendor licence number" defaultValue={values.pstNumber} />
      </FormGrid>
      <TextAreaField name="invoiceFooter" label="Invoice footer" defaultValue={values.invoiceFooter} rows={3} className="mt-4" hint="e.g. payment instructions, terms, thank-you note." />
      <FormActions>
        <SubmitButton>Save</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
