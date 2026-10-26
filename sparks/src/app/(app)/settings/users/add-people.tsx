"use client";

import { ActionForm, CheckboxField, FieldError, FormActions, FormGrid, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrator (everything, including Settings)" },
  { value: "OFFICE", label: "Office (dispatch, work orders, billing)" },
  { value: "TECHNICIAN", label: "Technician (their own jobs and time, no prices)" },
];

export function AddUserForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action}>
      <FormGrid>
        <TextField name="name" label="Name" required placeholder="First Last" />
        <TextField name="email" label="Email" required type="email" placeholder="name@starelectric.ca" hint="The address they'll sign in with (company Microsoft account)." />
        <SelectField name="role" label="Role" options={ROLE_OPTIONS} defaultValue="TECHNICIAN" blankLabel={null} required />
        <CheckboxField name="electrician" label="Electrician (can be scheduled and enter time)" defaultChecked />
      </FormGrid>
      <FormActions>
        <SubmitButton>Add user</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ImportUsersForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action}>
      <p className="mb-3 text-sm text-muted">
        A <span className="font-mono">.csv</span> with columns <b>Name</b>, <b>User Name</b> and <b>Role</b> (Administrator, Office or Basic User), like the
        ServiceBox user list. Emails become <span className="font-mono">username@starelectric.ca</span> unless there&apos;s an <b>Email</b> column. Basic
        Users are set up as electricians. Running it again updates people instead of adding them twice.
      </p>
      <label htmlFor="users-file" className="mb-1 block text-sm font-semibold">Users file</label>
      <input id="users-file" name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
      <FieldError name="file" />
      <FormActions>
        <SubmitButton>Import users</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
