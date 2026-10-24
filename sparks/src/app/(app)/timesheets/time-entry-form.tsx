"use client";

import { ActionForm, FormActions, FormGrid, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

interface Option {
  value: string;
  label: string;
}

export interface TimeEntryValues {
  id?: string;
  date?: string;
  workOrderId?: string | null;
  itemTypeId?: string | null;
  hours?: string;
  startTime?: string;
  endTime?: string;
  description?: string | null;
  laborRateId?: string | null;
}

export function TimeEntryForm({
  action,
  employeeId,
  values,
  options,
}: {
  action: FormAction;
  employeeId: string;
  values: TimeEntryValues;
  options: { workOrders: Option[]; itemTypes: Option[]; laborRates?: Option[] };
}) {
  return (
    <ActionForm action={action} className="mt-2 rounded-md border border-gray-200 bg-surface/50 p-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="date" label="Date" type="date" defaultValue={values.date} required />
        <SelectField name="itemTypeId" label="Type" options={options.itemTypes} defaultValue={values.itemTypeId} required blankLabel={null} />
        <SelectField name="workOrderId" label="Work order" options={options.workOrders} defaultValue={values.workOrderId} blankLabel="None (shop time, training…)" className="sm:col-span-2" />
        <TextField name="hours" label="Hours" defaultValue={values.hours} inputMode="decimal" placeholder="7.5 or 7:30" hint="Or fill in start and end." />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="startTime" label="Start" type="time" defaultValue={values.startTime} />
          <TextField name="endTime" label="End" type="time" defaultValue={values.endTime} />
        </div>
        <TextField name="description" label="What you did" defaultValue={values.description} className="sm:col-span-2" placeholder="e.g. Pulled feeders, terminated panel" />
        {options.laborRates && <SelectField name="laborRateId" label="Labour rate" options={options.laborRates} defaultValue={values.laborRateId} blankLabel="Employee's default" />}
      </FormGrid>
      <FormActions>
        <SubmitButton variant="dark">{values.id ? "Save entry" : "Add time"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function SendBackForm({ action, employeeId, weekStart }: { action: FormAction; employeeId: string; weekStart: string }) {
  return (
    <ActionForm action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="weekStart" value={weekStart} />
      <TextField name="reason" label="Reason for sending back" placeholder="e.g. Tuesday is missing the work order" className="min-w-64 flex-1" />
      <SubmitButton variant="danger">Send back</SubmitButton>
    </ActionForm>
  );
}
