"use client";

import { ActionForm, CheckboxField, FormActions, FormGrid, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { Option } from "@/server/options";

export interface ContactValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  jobSiteId?: string | null;
  isPrimary?: boolean;
}

export function ContactForm({ action, customerId, sites, values = {} }: { action: FormAction; customerId: string; sites: Option[]; values?: ContactValues }) {
  return (
    <ActionForm action={action} className="mt-3 rounded-md border border-gray-200 bg-surface/50 p-4">
      <input type="hidden" name="customerId" value={customerId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="firstName" label="First name" defaultValue={values.firstName} required />
        <TextField name="lastName" label="Last name" defaultValue={values.lastName} required />
        <TextField name="title" label="Title" defaultValue={values.title} placeholder="Facilities Manager" />
        <SelectField name="jobSiteId" label="Job site" options={sites} defaultValue={values.jobSiteId} blankLabel="All sites" />
        <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone} />
        <TextField name="mobile" label="Mobile" type="tel" defaultValue={values.mobile} />
        <TextField name="email" label="Email" type="email" defaultValue={values.email} className="sm:col-span-2" />
        <CheckboxField name="isPrimary" label="Primary contact" defaultChecked={values.isPrimary} />
      </FormGrid>
      <FormActions>
        <SubmitButton variant="dark">{values.id ? "Save contact" : "Add contact"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
