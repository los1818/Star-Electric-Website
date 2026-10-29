import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { formatPercentBp } from "@/lib/markup";
import { updateInventoryItem } from "@/server/actions/inventory";
import { itemFormOptions } from "../../form-options";
import { ItemForm } from "../../item-form";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAccess("inventory:write");
  // Pricing pages: both permissions (requirePageAccess alone allows "any of").
  if (!can(user.role, "pricing:view")) redirect("/forbidden");
  const { id } = await params;
  const i = await db.inventoryItem.findUnique({ where: { id } });
  if (!i) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${i.description}`} back={{ href: `/inventory/${i.id}`, label: i.description }} />
      <Card>
        <ItemForm
          action={updateInventoryItem}
          submitLabel="Save"
          values={{
            id: i.id,
            description: i.description,
            sku: i.sku,
            categoryId: i.categoryId,
            unitId: i.unitId,
            manufacturer: i.manufacturer,
            partNumber: i.partNumber,
            priceUnit: i.priceUnit,
            tradePrice: (i.tradePriceCents / 100).toFixed(2),
            discount: i.discountBp ? formatPercentBp(i.discountBp).replace("%", "") : "0",
            laborHours: i.laborHours?.toString() ?? null,
            laborUnit: i.laborUnit,
            noLabor: i.noLabor,
            active: i.active,
          }}
          {...await itemFormOptions()}
        />
      </Card>
    </div>
  );
}
