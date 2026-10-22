import type { Prisma } from "@prisma/client";

// Registry of the editable lookup tables shown in Settings. The key is used in URLs and
// server actions; `model` is the Prisma delegate name.
export const LOOKUP_TABLES = {
  "customer-categories": { label: "Customer categories", model: "customerCategory" },
  "work-order-types": { label: "Work order types", model: "workOrderType" },
  "work-order-statuses": { label: "Work order statuses", model: "workOrderStatus" },
  priorities: { label: "Priorities", model: "priority" },
  "quote-statuses": { label: "Quote statuses", model: "quoteStatus" },
  "invoice-statuses": { label: "Invoice statuses", model: "invoiceStatus" },
  "purchase-order-statuses": { label: "Purchase order statuses", model: "purchaseOrderStatus" },
  "timesheet-item-types": { label: "Timesheet item types", model: "timesheetItemType" },
  "tax-components": { label: "Tax components", model: "taxComponent" },
  "tax-levels": { label: "Tax levels", model: "taxLevel" },
  "payment-terms": { label: "Payment terms", model: "paymentTerm" },
  "payment-methods": { label: "Payment methods", model: "paymentMethod" },
  units: { label: "Units of measure", model: "unitOfMeasure" },
  "inventory-categories": { label: "Inventory categories", model: "inventoryCategory" },
  trades: { label: "Trades", model: "trade" },
  "labor-rates": { label: "Labour rates", model: "laborRate" },
  "equipment-types": { label: "Equipment types", model: "equipmentType" },
} as const satisfies Record<string, { label: string; model: Uncapitalize<Prisma.ModelName> }>;

export type LookupKey = keyof typeof LOOKUP_TABLES;

export const LOOKUP_KEYS = Object.keys(LOOKUP_TABLES) as LookupKey[];

export function isLookupKey(value: string): value is LookupKey {
  return value in LOOKUP_TABLES;
}

/** Columns every lookup table shares, which the generic Settings editor can change. */
export interface LookupRow {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
}
