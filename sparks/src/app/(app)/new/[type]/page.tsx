import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/server";
import { NEW_MENU_ITEMS } from "@/lib/nav";

export default async function NewRecordPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const item = NEW_MENU_ITEMS.find((i) => i.type === type);
  if (!item) notFound();
  await requirePageAccess(item.permission);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">New {item.label.toLowerCase()}</h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-brand" aria-hidden />
      <p className="mt-6 rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
        Creating records arrives in a later phase (see docs/SPEC.md §8).
      </p>
    </div>
  );
}
