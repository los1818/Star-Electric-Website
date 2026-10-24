"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, FieldError, FormActions, FormGrid, SelectField, SubmitButton, TextAreaField, TextField, useFormField, useFormValues } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { WorkOrderFormOptions } from "./form-options";

export interface WorkOrderFormValues {
  id?: string;
  customerId?: string | null;
  jobSiteId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  typeId?: string | null;
  priorityId?: string | null;
  summary?: string;
  description?: string | null;
  customerPoNumber?: string | null;
  notToExceed?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  assigneeIds?: string[];
  leadEmployeeId?: string | null;
}

function CustomerScopedFields({ options, values }: { options: WorkOrderFormOptions; values: WorkOrderFormValues }) {
  const customer = useFormField("customerId", values.customerId);
  const [customerId, setCustomerId] = useState(customer.defaultValue);
  const sites = options.sites.filter((o) => o.customerId === customerId);
  const contacts = options.contacts.filter((o) => o.customerId === customerId);
  const projects = options.projects.filter((o) => o.customerId === customerId);
  return (
    <FormGrid>
      <div className="sm:col-span-2">
        <label htmlFor="wo-customer" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Customer<span className="text-red-700"> *</span>
        </label>
        <select
          id="wo-customer"
          name="customerId"
          defaultValue={customer.defaultValue}
          onChange={(e) => setCustomerId(e.target.value)}
          aria-invalid={customer.error ? true : undefined}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${customer.error ? "border-red-400" : "border-gray-300"}`}
        >
          <option value="">Choose…</option>
          {options.customers.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <FieldError name="customerId" />
      </div>
      {/* Keyed by customer so choices reset when the customer changes. */}
      <div key={customerId} className="contents">
        <SelectField
          name="jobSiteId"
          label="Job site"
          required
          options={sites}
          defaultValue={sites.length === 1 ? sites[0].value : values.jobSiteId}
          blankLabel={customerId ? (sites.length ? "Choose…" : "This customer has no job sites") : "Choose a customer first"}
        />
        <SelectField name="contactId" label="Contact" options={contacts} defaultValue={values.contactId} blankLabel={contacts.length ? "None" : "No contacts"} />
        <SelectField name="projectId" label="Project" options={projects} defaultValue={values.projectId} blankLabel={projects.length ? "Not part of a project" : "No open projects"} />
      </div>
    </FormGrid>
  );
}

function CrewFields({ options, values }: { options: WorkOrderFormOptions; values: WorkOrderFormValues }) {
  const initial = useFormValues("assigneeIds", values.assigneeIds ?? []);
  const [selected, setSelected] = useState<string[]>(initial);
  const lead = useFormField("leadEmployeeId", values.leadEmployeeId);
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Crew</h2>
      <fieldset>
        <legend className="sr-only">Assigned electricians</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {options.employees.map((e) => (
            <label key={e.value} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface">
              <input
                type="checkbox"
                name="assigneeIds"
                value={e.value}
                defaultChecked={initial.includes(e.value)}
                onChange={(ev) => setSelected((s) => (ev.target.checked ? [...s, e.value] : s.filter((x) => x !== e.value)))}
                className="size-4 accent-brand"
              />
              <span>{e.label}</span>
              {e.detail && <span className="text-xs text-muted">{e.detail}</span>}
            </label>
          ))}
        </div>
        <FieldError name="assigneeIds" />
      </fieldset>
      {selected.length > 1 && (
        <div className="mt-3 max-w-xs">
          <SelectField
            name="leadEmployeeId"
            label="Lead"
            options={options.employees.filter((e) => selected.includes(e.value))}
            defaultValue={selected.includes(lead.defaultValue) ? lead.defaultValue : selected[0]}
            blankLabel={null}
          />
        </div>
      )}
    </div>
  );
}

export function WorkOrderForm({ action, values, options, cancelHref }: { action: FormAction; values: WorkOrderFormValues; options: WorkOrderFormOptions; cancelHref: string }) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <CustomerScopedFields options={options} values={values} />

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">The work</h2>
      <FormGrid>
        <TextField name="summary" label="Summary" defaultValue={values.summary} required placeholder="e.g. Tripping breaker in break room" className="sm:col-span-2" />
        <SelectField name="typeId" label="Type" options={options.types} defaultValue={values.typeId} required blankLabel="Choose…" />
        <SelectField name="priorityId" label="Priority" options={options.priorities} defaultValue={values.priorityId} required blankLabel="Choose…" />
      </FormGrid>
      <TextAreaField name="description" label="Description" defaultValue={values.description} rows={5} className="mt-4" hint="What the customer reported, and anything the crew should know." />

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">Schedule and billing</h2>
      <FormGrid>
        <TextField name="scheduledStart" label="Planned start" type="datetime-local" defaultValue={values.scheduledStart} hint="Regina time." />
        <TextField name="scheduledEnd" label="Planned end" type="datetime-local" defaultValue={values.scheduledEnd} />
        <TextField name="customerPoNumber" label="Customer PO number" defaultValue={values.customerPoNumber} />
        <TextField name="notToExceedCents" label="Not-to-exceed ($)" defaultValue={values.notToExceed} inputMode="decimal" hint="Leave blank if there's no cap." />
      </FormGrid>

      <CrewFields options={options} values={values} />

      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create work order"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}
