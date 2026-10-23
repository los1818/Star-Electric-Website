import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { COMPANY_FIELDS, type CompanyField } from "@/lib/company";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Company information" };

export default async function CompanySettingsPage() {
  await requirePageAccess("settings:manage");
  const rows = await db.companySetting.findMany({ where: { key: { in: Object.values(COMPANY_FIELDS) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const values = Object.fromEntries(Object.entries(COMPANY_FIELDS).map(([field, key]) => [field, byKey.get(key) ?? ""])) as Record<CompanyField, string>;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Company information" back={{ href: "/settings", label: "Settings" }} subtitle="Shown on quotes, invoices and purchase orders." />
      <CompanyForm values={values} />
    </div>
  );
}
