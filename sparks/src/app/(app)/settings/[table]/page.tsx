import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/server";
import { LOOKUP_TABLES, isLookupKey } from "@/lib/lookups";
import { listLookup } from "@/server/lookups";
import { LookupEditor } from "./lookup-editor";

export default async function LookupTablePage({ params }: { params: Promise<{ table: string }> }) {
  await requirePageAccess("settings:manage");
  const { table } = await params;
  if (!isLookupKey(table)) notFound();
  const rows = await listLookup(table);

  return (
    <div className="max-w-4xl">
      <Link href="/settings" className="text-sm text-gray-500 hover:underline">← Settings</Link>
      <h1 className="mt-1 text-2xl font-semibold">{LOOKUP_TABLES[table].label}</h1>
      <LookupEditor table={table} rows={rows} />
    </div>
  );
}
