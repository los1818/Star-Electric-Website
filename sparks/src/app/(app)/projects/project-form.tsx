"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, FieldError, FormActions, FormGrid, SelectField, SubmitButton, TextAreaField, TextField, useFormField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";
import type { ProjectFormOptions } from "./form-options";

export interface ProjectFormValues {
  id?: string;
  name?: string;
  customerId?: string | null;
  jobSiteId?: string | null;
  statusId?: string | null;
  managerId?: string | null;
  taxLevelId?: string | null;
  contractNumber?: string | null;
  customerPoNumber?: string | null;
  originalContract?: string;
  holdback?: string;
  startDate?: string;
  substantialCompletion?: string;
  notes?: string | null;
}

export function ProjectForm({ action, values, options, cancelHref }: { action: FormAction; values: ProjectFormValues; options: ProjectFormOptions; cancelHref: string }) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <Fields values={values} options={options} />
      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create project"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}

function Fields({ values, options }: { values: ProjectFormValues; options: ProjectFormOptions }) {
  const customer = useFormField("customerId", values.customerId);
  const [customerId, setCustomerId] = useState(customer.defaultValue);
  const sites = options.sites.filter((s) => s.customerId === customerId);
  return (
    <>
      <FormGrid>
        <TextField name="name" label="Project name" defaultValue={values.name} required autoFocus className="sm:col-span-2" placeholder="e.g. 2nd floor tenant improvement" />
        <div>
          <label htmlFor="project-customer" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Customer<span className="text-red-700"> *</span></label>
          <select id="project-customer" name="customerId" defaultValue={customer.defaultValue} onChange={(e) => setCustomerId(e.target.value)} className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${customer.error ? "border-red-400" : "border-gray-300"}`}>
            <option value="">Choose…</option>
            {options.customers.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldError name="customerId" />
        </div>
        <div key={customerId}>
          <SelectField name="jobSiteId" label="Job site" options={sites} defaultValue={values.jobSiteId} blankLabel={customerId ? "None" : "Choose a customer first"} />
        </div>
        <SelectField name="statusId" label="Status" options={options.statuses} defaultValue={values.statusId} required blankLabel="Choose…" />
        <SelectField name="managerId" label="Project manager" options={options.managers} defaultValue={values.managerId} />
      </FormGrid>

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">Contract</h2>
      <FormGrid>
        <TextField name="originalContractCents" label="Contract value ($)" defaultValue={values.originalContract} required inputMode="decimal" hint="Before change orders." />
        <TextField name="holdbackBp" label="Holdback (%)" defaultValue={values.holdback ?? "10"} required inputMode="decimal" hint="Saskatchewan Builders' Lien Act standard is 10%." />
        <TextField name="contractNumber" label="Contract / subcontract number" defaultValue={values.contractNumber} />
        <TextField name="customerPoNumber" label="Customer PO number" defaultValue={values.customerPoNumber} />
        <SelectField name="taxLevelId" label="Tax level" options={options.taxLevels} defaultValue={values.taxLevelId} blankLabel="Same as customer" />
      </FormGrid>

      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-wide">Dates</h2>
      <FormGrid>
        <TextField name="startDate" label="Start" type="date" defaultValue={values.startDate} />
        <TextField name="substantialCompletion" label="Substantial completion" type="date" defaultValue={values.substantialCompletion} hint="Starts the lien period before holdback is released." />
      </FormGrid>
      <TextAreaField name="notes" label="Notes" defaultValue={values.notes} rows={4} className="mt-4" />
    </>
  );
}
