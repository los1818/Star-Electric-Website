"use client";

import Link from "next/link";
import { ActionForm, FormActions, FormGrid, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

export interface VendorFormValues {
  id?: string;
  name?: string;
  accountNumber?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal?: string | null;
}

export function VendorForm({ action, values, cancelHref }: { action: FormAction; values: VendorFormValues; cancelHref: string }) {
  return (
    <ActionForm action={action} className="rounded-md bg-white p-6 shadow-card">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="name" label="Vendor name" defaultValue={values.name} required autoFocus className="sm:col-span-2" />
        <TextField name="accountNumber" label="Our account number" defaultValue={values.accountNumber} />
        <TextField name="contactName" label="Contact / rep" defaultValue={values.contactName} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone} />
        <TextField name="email" label="Orders email" type="email" defaultValue={values.email} />
        <TextField name="street" label="Street" defaultValue={values.street} className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={values.city ?? "Regina"} />
        <div className="grid grid-cols-2 gap-4">
          <TextField name="province" label="Province" defaultValue={values.province ?? "SK"} maxLength={2} />
          <TextField name="postal" label="Postal code" defaultValue={values.postal} placeholder="S4P 3Y2" />
        </div>
      </FormGrid>
      <FormActions>
        <SubmitButton>{values.id ? "Save changes" : "Create vendor"}</SubmitButton>
        <Link href={cancelHref} className="text-sm text-muted hover:underline">Cancel</Link>
      </FormActions>
    </ActionForm>
  );
}
