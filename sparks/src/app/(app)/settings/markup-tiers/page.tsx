import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { MarkupTierEditor } from "./markup-tier-editor";

export const metadata = { title: "Markup tiers" };

export default async function MarkupTiersPage() {
  await requirePageAccess("settings:manage");
  const tiers = await db.markupTier.findMany({ orderBy: { minMaterialCostCents: "asc" } });

  return (
    <div className="max-w-3xl">
      <Link href="/settings" className="text-sm text-gray-500 hover:underline">← Settings</Link>
      <h1 className="mt-1 text-2xl font-semibold">Markup tiers</h1>
      <p className="mt-1 text-sm text-gray-600">
        Sparks suggests a starting material markup on each quote and invoice from the job&apos;s total material cost. The
        highest tier the job reaches wins. It&apos;s only a starting point: you can change the markup on any quote, invoice
        or line.
      </p>
      <MarkupTierEditor initial={tiers.map(({ minMaterialCostCents, markupBp }) => ({ minMaterialCostCents, markupBp }))} />
    </div>
  );
}
