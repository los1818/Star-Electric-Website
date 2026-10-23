import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { LOOKUP_TABLES, isLookupKey, lookupFields } from "@/lib/lookups";
import { listLookupRecords } from "@/server/lookups";
import { LookupEditor } from "./lookup-editor";

export default async function LookupTablePage({ params }: { params: Promise<{ table: string }> }) {
  await requirePageAccess("settings:manage");
  const { table } = await params;
  if (!isLookupKey(table)) notFound();
  const rows = await listLookupRecords(table);
  const components =
    table === "tax-levels"
      ? (await db.taxComponent.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })).map((c) => ({ value: c.id, label: `${c.label} ${c.rateBp / 100}%` }))
      : undefined;
  return (
    <div className="max-w-4xl">
      <PageHeader title={LOOKUP_TABLES[table].label} back={{ href: "/settings", label: "Settings" }} subtitle="Click a row to edit it. Rows can be deactivated but not deleted, so old records keep their values." />
      <LookupEditor table={table} fields={lookupFields(table)} rows={rows} components={components} />
    </div>
  );
}
