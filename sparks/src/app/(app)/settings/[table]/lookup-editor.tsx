"use client";

import { Badge } from "@/components/ui/badge";
import { ActionForm, CheckboxField, FormActions, FormGrid, SubmitButton, TextField } from "@/components/ui/form";
import { formatMultiplier, type LookupField, type LookupKey, type LookupRecord } from "@/lib/lookups";
import { formatPercentBp } from "@/lib/markup";
import { formatCents } from "@/lib/money";
import { saveLookupRow } from "@/server/actions/settings";

interface Option {
  value: string;
  label: string;
}

/** Display value of a table-specific field in the row list. */
function summary(f: LookupField, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === "") return null;
  switch (f.type) {
    case "color":
      return <span className="inline-block size-3 rounded-full align-middle" style={{ backgroundColor: String(v) }} aria-label={String(v)} />;
    case "boolean":
      return v ? <Badge color="#2563eb">{f.label}</Badge> : null;
    case "percent":
      return formatPercentBp(Number(v));
    case "multiplier":
      return `×${formatMultiplier(Number(v))}`;
    case "money":
      return `${f.label}: ${formatCents(Number(v))}`;
    case "int":
      return `${v} ${f.label.toLowerCase()}`;
    case "text":
      return String(v);
  }
}

/** Form input value for a table-specific field. */
function inputValue(f: LookupField, v: unknown): string {
  if (v === null || v === undefined) return f.type === "color" ? "#6b7280" : "";
  switch (f.type) {
    case "percent":
      return formatPercentBp(Number(v)).replace("%", "");
    case "multiplier":
      return formatMultiplier(Number(v));
    case "money":
      return (Number(v) / 100).toFixed(2);
    default:
      return String(v);
  }
}

function RowForm({ table, fields, row, components }: { table: LookupKey; fields: readonly LookupField[]; row?: LookupRecord; components?: Option[] }) {
  const selected = new Set((row?.componentIds as string[] | undefined) ?? []);
  return (
    <ActionForm action={saveLookupRow} className="mt-3 rounded-md border border-gray-200 bg-surface/50 p-4">
      <input type="hidden" name="table" value={table} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <FormGrid>
        <TextField name="label" label="Label" defaultValue={row?.label} required />
        {row ? (
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Code</span>
            <span className="font-mono text-sm">{row.code}</span>
            <p className="mt-1 text-xs text-muted">Codes can&apos;t change; Sparks uses them internally.</p>
          </div>
        ) : (
          <TextField name="code" label="Code" required placeholder="e.g. NET60" hint="Short, permanent identifier. Letters, numbers and underscores." />
        )}
        {fields
          .filter((f) => f.type !== "boolean")
          .map((f) => (
            <TextField
              key={f.name}
              name={f.name}
              label={f.label}
              hint={f.hint}
              defaultValue={inputValue(f, row?.[f.name])}
              type={f.type === "color" ? "color" : f.type === "int" ? "number" : "text"}
              inputMode={["percent", "money", "multiplier"].includes(f.type) ? "decimal" : undefined}
              required={["percent", "money", "multiplier", "int"].includes(f.type)}
              className={f.type === "color" ? "[&_input]:h-10 [&_input]:p-1" : undefined}
            />
          ))}
        <TextField name="sortOrder" label="Order" type="number" min={0} defaultValue={String(row?.sortOrder ?? 100)} hint="Lower numbers are listed first." />
      </FormGrid>
      {components && (
        <fieldset className="mt-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Taxes in this level</legend>
          <div className="flex flex-wrap gap-4">
            {components.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="components" value={c.value} defaultChecked={selected.has(c.value)} className="size-4 accent-brand" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap gap-6">
        {fields
          .filter((f) => f.type === "boolean")
          .map((f) => (
            <CheckboxField key={f.name} name={f.name} label={f.label} hint={f.hint} defaultChecked={Boolean(row?.[f.name])} />
          ))}
        <CheckboxField name="active" label="Active" hint="Inactive rows stay on old records but can't be picked for new ones." defaultChecked={row ? row.active : true} />
      </div>
      <FormActions>
        <SubmitButton variant="dark">{row ? "Save" : "Add"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function LookupEditor({ table, fields, rows, components }: { table: LookupKey; fields: readonly LookupField[]; rows: LookupRecord[]; components?: Option[] }) {
  const componentLabel = new Map(components?.map((c) => [c.value, c.label]));
  return (
    <div className="space-y-6">
      <ul className="divide-y divide-gray-100 rounded-md bg-white shadow-card">
        {rows.map((row) => (
          <li key={row.id} className="px-5 py-3">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{row.label}</span>
                <span className="font-mono text-xs text-muted">{row.code}</span>
                {fields.map((f) => (
                  <span key={f.name} className="text-muted">{summary(f, row[f.name])}</span>
                ))}
                {components && (
                  <span className="text-muted">
                    {((row.componentIds as string[]) ?? []).map((id) => componentLabel.get(id)).join(" + ") || "No tax"}
                  </span>
                )}
                {!row.active && <Badge color="#6b7280">Inactive</Badge>}
                <span className="ml-auto text-xs font-semibold text-muted">Edit ▾</span>
              </summary>
              <RowForm table={table} fields={fields} row={row} components={components} />
            </details>
          </li>
        ))}
      </ul>
      <details className="rounded-md bg-white p-5 shadow-card">
        <summary className="cursor-pointer text-sm font-bold">+ Add new</summary>
        <RowForm table={table} fields={fields} components={components} />
      </details>
    </div>
  );
}
