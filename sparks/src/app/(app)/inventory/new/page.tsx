import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/permissions";
import { requirePageAccess } from "@/lib/auth/server";
import { createInventoryItem } from "@/server/actions/inventory";
import { itemFormOptions } from "../form-options";
import { ItemForm } from "../item-form";

export const metadata = { title: "New item" };

export default async function NewItemPage() {
  const user = await requirePageAccess("inventory:write");
  // Pricing pages: both permissions (requirePageAccess alone allows "any of").
  if (!can(user.role, "pricing:view")) redirect("/forbidden");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New item" back={{ href: "/inventory", label: "Inventory" }} />
      <Card>
        <ItemForm action={createInventoryItem} submitLabel="Create item" {...await itemFormOptions()} />
      </Card>
    </div>
  );
}
