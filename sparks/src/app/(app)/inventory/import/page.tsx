import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { parseAccubidRows } from "@/lib/imports/accubid";
import { formatCents } from "@/lib/money";
import { formatPercentBp } from "@/lib/markup";
import { param, type SearchParams } from "@/lib/list-params";
import { applyAccubidFile, uploadAccubidFile } from "@/server/actions/inventory";
import { planAccubidImport, readAccubidWorkbook } from "@/server/imports/accubid";
import { storage } from "@/server/storage";
import { ConfirmForm, UploadForm } from "./forms";

export const metadata = { title: "Import inventory" };

const ISSUE_LABELS: Record<string, string> = {
  QTY_INFERRED: "Quantity worked out from the value",
  QTY_MISSING: "Quantity missing",
  VALUE_MISMATCH: "Value doesn't match quantity × cost",
  DUPLICATE_MERGED: "Duplicate lines merged",
  STALE_PRICE: "Price older than 3 years",
  ZERO_STOCK: "Zero stock",
  BAD_ROW: "Lines skipped",
  TOTALS_MISMATCH: "Totals don't match",
};

export default async function ImportInventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("inventory:write");
  // Pricing pages: both permissions (requirePageAccess alone allows "any of").
  if (!can(user.role, "pricing:view")) redirect("/forbidden");
  const sp = await searchParams;
  const token = param(sp, "file");
  const bytes = /^[0-9a-f-]{36}$/.test(token) ? await storage.get(`imports/${token}.xlsx`) : null;

  const header = (
    <PageHeader
      title="Import from Accubid"
      subtitle="Adds new items and updates prices from an Accubid inventory export. Run it again whenever you have a fresh export: items are matched by description, never duplicated."
      back={{ href: "/inventory", label: "Inventory" }}
    />
  );

  if (!bytes) {
    return (
      <div className="max-w-3xl">
        {header}
        {token && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">That upload has expired. Upload the file again.</p>}
        <Card title="Upload">
          <p className="mb-3 text-sm text-muted">
            In Accubid, export the inventory (the &quot;Ext&quot; extension sheet) to Excel and choose that file here. You&apos;ll see what will change before
            anything is saved.
          </p>
          <UploadForm action={uploadAccubidFile} />
        </Card>
      </div>
    );
  }

  const parse = parseAccubidRows(await readAccubidWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
  const plan = await planAccubidImport(db, parse);
  const hasStock = (await db.stockLevel.count()) > 0;
  const issueCounts = new Map<string, number>();
  for (const i of parse.issues) issueCounts.set(i.kind, (issueCounts.get(i.kind) ?? 0) + 1);
  const ups = plan.priceChanges.filter((c) => c.newCostCents > c.oldCostCents).length;

  return (
    <div className="max-w-5xl">
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="What this file will do">
            <ul className="space-y-1 text-sm">
              <li><b>{parse.items.length}</b> items in the file, {formatCents(parse.importedTotalCents)} of stock at cost</li>
              <li><b>{plan.newItems.length}</b> new item{plan.newItems.length === 1 ? "" : "s"} to add</li>
              <li><b>{plan.priceChanges.length}</b> price change{plan.priceChanges.length === 1 ? "" : "s"} ({ups} up, {plan.priceChanges.length - ups} down)</li>
              <li><b>{plan.unchanged}</b> already up to date</li>
              {plan.notInFile > 0 && <li>{plan.notInFile} item{plan.notInFile === 1 ? "" : "s"} in Sparks aren&apos;t in this file and will be left as they are</li>}
            </ul>
          </Card>
          {plan.priceChanges.length > 0 && (
            <Card title={`Biggest price changes${plan.priceChanges.length > 25 ? " (top 25)" : ""}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1 font-semibold">Item</th>
                    <th className="py-1 text-right font-semibold">Net cost now</th>
                    <th className="py-1 text-right font-semibold">New</th>
                    <th className="py-1 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.priceChanges.slice(0, 25).map((c) => (
                    <tr key={c.sku} className="border-t border-gray-100">
                      <td className="py-1.5">{c.description}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCents(c.oldCostCents)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCents(c.newCostCents)}</td>
                      <td className={`py-1.5 text-right font-semibold tabular-nums ${c.newCostCents > c.oldCostCents ? "text-red-700" : "text-green-700"}`}>
                        {c.changeBp === null ? "new cost" : c.changeBp === 0 ? "unit changed" : `${c.changeBp > 0 ? "+" : "-"}${formatPercentBp(Math.abs(c.changeBp))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Import">
            <ConfirmForm action={applyAccubidFile} file={token} fileName={param(sp, "name")} stockDefault={!hasStock} />
            <p className="mt-3 text-xs text-muted">
              Not right? <Link href="/inventory/import" className="underline">Upload a different file</Link>.
            </p>
          </Card>
          {issueCounts.size > 0 && (
            <Card title="Worth a look">
              <ul className="space-y-1 text-sm">
                {[...issueCounts].map(([kind, n]) => (
                  <li key={kind}>{ISSUE_LABELS[kind] ?? kind}: {n}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">These don&apos;t stop the import; they&apos;re worth checking in Accubid.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
