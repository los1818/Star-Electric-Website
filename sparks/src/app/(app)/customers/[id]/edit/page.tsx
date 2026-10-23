import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { updateCustomer } from "@/server/actions/customers";
import { lookupOptions } from "@/server/options";
import { CustomerForm } from "../../customer-form";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("customers:write");
  const { id } = await params;
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) notFound();
  const [categories, paymentTerms, taxLevels] = await Promise.all([
    lookupOptions("customer-categories", c.categoryId),
    lookupOptions("payment-terms", c.paymentTermId),
    lookupOptions("tax-levels", c.taxLevelId),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${c.name}`} back={{ href: `/customers/${c.id}`, label: c.name }} />
      <CustomerForm action={updateCustomer} values={c} options={{ categories, paymentTerms, taxLevels }} cancelHref={`/customers/${c.id}`} />
    </div>
  );
}
