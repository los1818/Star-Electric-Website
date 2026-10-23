import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/lib/auth/server";
import { createCustomer } from "@/server/actions/customers";
import { defaultTaxLevelId, lookupOptions } from "@/server/options";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePageAccess("customers:write");
  const [categories, paymentTerms, taxLevels, taxLevelId] = await Promise.all([
    lookupOptions("customer-categories"),
    lookupOptions("payment-terms"),
    lookupOptions("tax-levels"),
    defaultTaxLevelId(),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New customer" back={{ href: "/customers", label: "Customers" }} />
      <CustomerForm action={createCustomer} values={{ taxLevelId }} options={{ categories, paymentTerms, taxLevels }} cancelHref="/customers" />
    </div>
  );
}
