"use client";

import { useState } from "react";
import { ActionForm, FormActions, SelectField, SubmitButton, TextField, useFormField } from "@/components/ui/form";
import { netCostCents, formatCents, parseCents } from "@/lib/money";
import { parsePercentBp } from "@/lib/markup";
import type { FormAction } from "@/server/actions/authorized-action";

export interface GridRow {
  id: string;
  description: string;
  per: string;
  trade: string;
  disc: string;
  stale: boolean;
}

function netCost(trade: string, disc: string): string {
  try {
    return formatCents(netCostCents(parseCents(trade || "0"), parsePercentBp(disc || "0")));
  } catch {
    return "?";
  }
}

function Row({ row }: { row: GridRow }) {
  const saved = `${row.trade}|${row.disc}`;
  const trade = useFormField(`trade:${row.id}`, row.trade);
  const disc = useFormField(`disc:${row.id}`, row.disc);
  // After a failed save the form re-fills what was typed, but only if it was typed over the price
  // still saved; if the price has changed since (e.g. a % adjustment), start from the new price.
  const typedOverSaved = useFormField(`was:${row.id}`, saved).defaultValue === saved;
  const [t, setT] = useState(typedOverSaved ? trade.defaultValue : row.trade);
  const [d, setD] = useState(typedOverSaved ? disc.defaultValue : row.disc);
  const changed = t !== row.trade || d !== row.disc;
  return (
    <tr className={`border-t border-gray-100 ${changed ? "bg-amber-50" : ""}`}>
      <td className="py-1.5 pr-2">
        <input type="hidden" name={`was:${row.id}`} value={saved} />
        {row.description}
        {trade.error && <p className="text-xs font-medium text-red-700">{trade.error}</p>}
      </td>
      <td className="py-1.5 pr-2 text-xs text-muted">{row.per}</td>
      <td className="py-1.5 pr-2">
        <input name={`trade:${row.id}`} value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal" aria-label={`Trade price for ${row.description}`} className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums" />
      </td>
      <td className="py-1.5 pr-2">
        <input name={`disc:${row.id}`} value={d} onChange={(e) => setD(e.target.value)} inputMode="decimal" aria-label={`Discount % for ${row.description}`} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm tabular-nums" />
      </td>
      <td className="py-1.5 text-right font-semibold tabular-nums">{netCost(t, d)}</td>
      <td className="py-1.5 pl-2 text-xs">{row.stale && <span className="font-semibold text-red-700">old</span>}</td>
    </tr>
  );
}

export function PriceGrid({ action, rows }: { action: FormAction; rows: GridRow[] }) {
  return (
    <ActionForm action={action}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-1 font-semibold">Item</th>
            <th className="py-1 font-semibold">Per</th>
            <th className="py-1 font-semibold">Trade price ($)</th>
            <th className="py-1 font-semibold">Disc. %</th>
            <th className="py-1 text-right font-semibold">Net cost</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            // Keyed by the saved price too: when it changes (a save or a % adjustment), the row starts
            // over from the new price, so saving the grid can never write old prices back.
            <Row key={`${r.id}:${r.trade}:${r.disc}`} row={r} />
          ))}
        </tbody>
      </table>
      <FormActions>
        <SubmitButton>Save prices</SubmitButton>
        <span className="text-xs text-muted">Changed rows are highlighted. Only those are saved, and each change is kept in the item&apos;s price history.</span>
      </FormActions>
    </ActionForm>
  );
}

export function PercentForm({ action, categories, q, category, age }: { action: FormAction; categories: { value: string; label: string }[]; q: string; category: string; age: string }) {
  const scope = [q && `matching "${q}"`, age === "stale" && "with prices over a year old"].filter(Boolean).join(" and ");
  return (
    <ActionForm action={action}>
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="age" value={age} />
      <SelectField name="categoryId" label="Category" options={categories} defaultValue={category} blankLabel="All categories" />
      <TextField name="percent" label="Change trade prices by %" placeholder="e.g. 8 or -5" hint={scope ? `Only items ${scope}, like the list. Minus sign to lower.` : "Use a minus sign to lower prices."} required className="mt-3" />
      <FormActions>
        <SubmitButton variant="dark">Apply</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
