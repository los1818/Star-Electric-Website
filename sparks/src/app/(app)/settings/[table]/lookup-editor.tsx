"use client";

import { useState, useTransition } from "react";
import type { LookupKey, LookupRow } from "@/lib/lookups";
import { updateLookupRow } from "@/server/actions/settings";

export function LookupEditor({ table, rows }: { table: LookupKey; rows: LookupRow[] }) {
  return (
    <table className="mt-6 w-full border-collapse rounded-md bg-white text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="p-2">Code</th>
          <th className="p-2">Label</th>
          <th className="p-2 w-24">Order</th>
          <th className="p-2 w-20">Active</th>
          <th className="p-2 w-40" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <LookupRowForm key={row.id} table={table} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function LookupRowForm({ table, row }: { table: LookupKey; row: LookupRow }) {
  const [label, setLabel] = useState(row.label);
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));
  const [active, setActive] = useState(row.active);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateLookupRow({ table, id: row.id, label, sortOrder: Number(sortOrder), active });
      setMessage(result.ok ? "Saved" : result.error);
    });
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="p-2 font-mono text-xs text-gray-500">{row.code}</td>
      <td className="p-2">
        <input aria-label={`Label for ${row.code}`} value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1" />
      </td>
      <td className="p-2">
        <input aria-label={`Order for ${row.code}`} type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1" />
      </td>
      <td className="p-2">
        <input aria-label={`Active for ${row.code}`} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="p-2">
        <button onClick={save} disabled={pending} className="rounded-md bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {message && <span className="ml-2 text-xs text-gray-600">{message}</span>}
      </td>
    </tr>
  );
}
