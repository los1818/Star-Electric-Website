"use client";

import { useState, useTransition } from "react";
import { formatCents, parseCents } from "@/lib/money";
import { formatPercentBp, parsePercentBp, type MarkupTierInput } from "@/lib/markup";
import { saveMarkupTiers } from "@/server/actions/markup-tiers";

interface Row {
  key: number;
  from: string;
  markup: string;
}

let nextKey = 0;
const toRow = (t: MarkupTierInput): Row => ({
  key: nextKey++,
  from: (t.minMaterialCostCents / 100).toFixed(2),
  markup: formatPercentBp(t.markupBp).replace("%", ""),
});

export function MarkupTierEditor({ initial }: { initial: MarkupTierInput[] }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial.map(toRow) : [toRow({ minMaterialCostCents: 0, markupBp: 0 })]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setMessage(null);
  }

  function save() {
    let tiers: MarkupTierInput[];
    try {
      tiers = rows.map((r) => ({ minMaterialCostCents: parseCents(r.from || "0"), markupBp: parsePercentBp(r.markup) }));
    } catch {
      setMessage("Check the amounts: use dollars like 1000 or 1000.00 and percentages like 25 or 22.5.");
      return;
    }
    startTransition(async () => {
      const result = await saveMarkupTiers({ tiers });
      if (result.ok) {
        setRows(result.data.map(toRow));
        setMessage("Saved");
      } else {
        setMessage(result.error);
      }
    });
  }

  return (
    <div className="mt-6">
      <table className="w-full border-collapse rounded bg-white text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="p-2">Job material cost from</th>
            <th className="p-2">Suggested markup</th>
            <th className="w-20 p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-b border-gray-100">
              <td className="p-2">
                <span className="mr-1 text-gray-500">$</span>
                <input aria-label={`Tier ${i + 1} from`} inputMode="decimal" value={r.from} onChange={(e) => update(r.key, { from: e.target.value })} className="w-32 rounded border border-gray-300 px-2 py-1" />
              </td>
              <td className="p-2">
                <input aria-label={`Tier ${i + 1} markup`} inputMode="decimal" value={r.markup} onChange={(e) => update(r.key, { markup: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1" />
                <span className="ml-1 text-gray-500">%</span>
              </td>
              <td className="p-2">
                {rows.length > 1 && (
                  <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs text-red-700 hover:underline">
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => setRows((rs) => [...rs, { key: nextKey++, from: "", markup: "" }])} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50">
          Add tier
        </button>
        <button onClick={save} disabled={pending} className="rounded bg-ink px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save tiers"}
        </button>
        {message && <span className="text-sm text-gray-700">{message}</span>}
      </div>
      <p className="mt-4 text-xs text-gray-500">
        Example: with tiers at $0 → 35% and $5,000 → 15%, a job with {formatCents(600_000)} of material starts at 15%.
      </p>
    </div>
  );
}
