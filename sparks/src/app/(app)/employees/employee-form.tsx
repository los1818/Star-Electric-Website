"use client";

import Link from "next/link";
import { ActionForm, FormActions, FormGrid, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { Option } from "@/server/options";

export interface EmployeeFormValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  tradeId?: string | null;
  laborRateId?: string | null;
  phone?: string | null;
  email?: string | null;
  hireDate?: Date | null;
}

export function EmployeeForm({ action, values, options, cancelHref }: { action: FormAction; values: EmployeeFormValues; options: { trades: Option[]; laborRates: Option[] }; cancelHref: string }) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="firstName" label="First name" defaultValue={values.firstName} required autoFocus />
        <TextField name="lastName" label="Last name" defaultValue={values.lastName} required />
        <SelectField name="tradeId" label="Trade" options={options.trades} defaultValue={values.tradeId} />
        <SelectField name="laborRateId" label="Default labour rate" options={options.laborRates} defaultValue={values.laborRateId} hint="Used for time entries unless changed." />
        <TextField name="phone" label="Mobile phone" type="tel" defaultValue={values.phone} />
        <TextField name="email" label="Email" type="email" defaultValue={values.email} />
        <TextField name="hireDate" label="Hire date" type="date" defaultValue={values.hireDate ? values.hireDate.toISOString().slice(0, 10) : ""} />
      </FormGrid>
      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create employee"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}
