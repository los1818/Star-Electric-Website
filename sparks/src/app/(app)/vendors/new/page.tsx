import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/lib/auth/server";
import { createVendor } from "@/server/actions/people";
import { VendorForm } from "../vendor-form";

export const metadata = { title: "New vendor" };

export default async function NewVendorPage() {
  await requirePageAccess("vendors:write");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New vendor" back={{ href: "/vendors", label: "Vendors" }} />
      <VendorForm action={createVendor} values={{}} cancelHref="/vendors" />
    </div>
  );
}
