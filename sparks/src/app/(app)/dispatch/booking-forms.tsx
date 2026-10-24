"use client";

import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

interface Option {
  value: string;
  label: string;
}

export interface BookingValues {
  id?: string;
  employeeId?: string | null;
  workOrderId?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
}

export function BookingForm({ action, values, options, compact = false }: { action: FormAction; values: BookingValues; options: { employees: Option[]; workOrders: Option[] }; compact?: boolean }) {
  const editing = Boolean(values.id);
  return (
    <ActionForm action={action} className={compact ? "mt-2 rounded-md border border-gray-200 bg-white p-3" : ""}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <SelectField name="employeeId" label="Electrician" options={options.employees} defaultValue={values.employeeId} required blankLabel="Choose…" />
        <SelectField name="workOrderId" label="Work order" options={options.workOrders} defaultValue={values.workOrderId} blankLabel="None (shop, training…)" className={compact ? "" : "lg:col-span-3"} />
        <TextField name="date" label={editing ? "Date" : "First day"} type="date" defaultValue={values.date} required />
        {!editing && <TextField name="throughDate" label="Through (optional)" type="date" hint="Books every weekday in between." />}
        <TextField name="startTime" label="Start" type="time" defaultValue={values.startTime ?? "07:00"} required />
        <TextField name="endTime" label="End" type="time" defaultValue={values.endTime ?? "15:30"} required />
        <TextField name="notes" label="Notes" defaultValue={values.notes} className={compact ? "" : "sm:col-span-2"} placeholder="Optional; required without a work order" />
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        {!editing && <CheckboxField name="includeWeekends" label="Include weekends" />}
        <CheckboxField name="allowOverlap" label="Allow double-booking" />
      </div>
      <FormActions>
        <SubmitButton variant={editing ? "dark" : "primary"}>{editing ? "Save booking" : "Book"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
