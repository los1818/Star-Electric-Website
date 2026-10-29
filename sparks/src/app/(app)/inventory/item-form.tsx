"use client";

import { ActionForm, CheckboxField, FormActions, FormGrid, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { FormAction } from "@/server/actions/authorized-action";

type Option = { value: string; label: string };

export interface ItemFormValues {
  id?: string;
  description?: string;
  sku?: string;
  categoryId?: string | null;
  unitId?: string | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  priceUnit?: string;
  tradePrice?: string;
  discount?: string;
  laborHours?: string | null;
  laborUnit?: string;
  noLabor?: boolean;
  active?: boolean;
}

export function ItemForm({ action, values = {}, categories, units, priceUnits, submitLabel }: { action: FormAction; values?: ItemFormValues; categories: Option[]; units: Option[]; priceUnits: Option[]; submitLabel: string }) {
  return (
    <ActionForm action={action}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormGrid>
        <TextField name="description" label="Description" defaultValue={values.description} required className="sm:col-span-2" />
        {values.id ? (
          <TextField name="skuShown" label="SKU" defaultValue={values.sku} readOnly hint="Can't change: Accubid imports find the item by it." />
        ) : (
          <TextField name="sku" label="SKU" defaultValue={values.sku} hint="Leave blank to make one up." />
        )}
        <SelectField name="categoryId" label="Category" options={categories} defaultValue={values.categoryId} />
        <SelectField name="unitId" label="Unit" options={units} defaultValue={values.unitId} />
        <TextField name="manufacturer" label="Manufacturer" defaultValue={values.manufacturer} />
        <TextField name="partNumber" label="Part number" defaultValue={values.partNumber} />
      </FormGrid>
      <h3 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide">Pricing</h3>
      <FormGrid>
        <SelectField name="priceUnit" label="Priced" options={priceUnits} defaultValue={values.priceUnit ?? "E"} blankLabel={null} required />
        <TextField name="tradePrice" label="Trade price ($)" defaultValue={values.tradePrice ?? "0.00"} required inputMode="decimal" />
        <TextField name="discount" label="Discount %" defaultValue={values.discount ?? "0"} inputMode="decimal" hint="Net cost = trade price less this discount." />
      </FormGrid>
      <h3 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide">Estimating labour</h3>
      <FormGrid>
        <TextField name="laborHours" label="Labour hours" defaultValue={values.laborHours} inputMode="decimal" />
        <SelectField name="laborUnit" label="Labour per" options={priceUnits} defaultValue={values.laborUnit ?? "E"} blankLabel={null} required />
        <CheckboxField name="noLabor" label="No labour (counted with another item)" defaultChecked={values.noLabor} />
        <CheckboxField name="active" label="Active" defaultChecked={values.active ?? true} />
      </FormGrid>
      <FormActions>
        <SubmitButton>{submitLabel}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
