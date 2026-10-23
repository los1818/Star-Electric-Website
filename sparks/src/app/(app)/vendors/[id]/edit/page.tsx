import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { updateVendor } from "@/server/actions/people";
import { VendorForm } from "../../vendor-form";

export const metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("vendors:write");
  const { id } = await params;
  const v = await db.vendor.findUnique({ where: { id } });
  if (!v) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${v.name}`} back={{ href: `/vendors/${v.id}`, label: v.name }} />
      <VendorForm action={updateVendor} values={v} cancelHref={`/vendors/${v.id}`} />
    </div>
  );
}
