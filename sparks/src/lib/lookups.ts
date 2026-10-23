import type { Prisma } from "@prisma/client";

// Registry of the editable lookup tables shown in Settings. The key is used in URLs and
// server actions; `model` is the Prisma delegate name; `fields` are the table's columns beyond
// the shared code/label/sortOrder/active, so one editor can handle every table.

export type LookupFieldType = "color" | "boolean" | "percent" | "multiplier" | "money" | "int" | "text";

export interface LookupField {
  name: string;
  label: string;
  type: LookupFieldType;
  hint?: string;
}

const color: LookupField = { name: "color", label: "Colour", type: "color" };

export const LOOKUP_TABLES = {
  "customer-categories": { label: "Customer categories", model: "customerCategory", fields: [color] },
  "work-order-types": { label: "Work order types", model: "workOrderType", fields: [color] },
  "work-order-statuses": {
    label: "Work order statuses",
    model: "workOrderStatus",
    fields: [
      color,
      { name: "isClosed", label: "Closed", type: "boolean", hint: "Drops off open-work lists and the dispatch board." },
      { name: "isBillable", label: "Ready to bill", type: "boolean", hint: "Work orders in this status can be pulled onto an invoice." },
    ],
  },
  priorities: { label: "Priorities", model: "priority", fields: [color] },
  "project-statuses": {
    label: "Project statuses",
    model: "projectStatus",
    fields: [color, { name: "isClosed", label: "Closed", type: "boolean", hint: "Drops off open-project lists." }],
  },
  "change-order-statuses": {
    label: "Change order statuses",
    model: "changeOrderStatus",
    fields: [color, { name: "isApproved", label: "Approved", type: "boolean", hint: "Counts toward the revised contract value." }],
  },
  "quote-statuses": { label: "Quote statuses", model: "quoteStatus", fields: [color] },
  "invoice-statuses": {
    label: "Invoice statuses",
    model: "invoiceStatus",
    fields: [color, { name: "isPosted", label: "Posted", type: "boolean", hint: "Posted invoices are locked; correct them with a void or credit note." }],
  },
  "purchase-order-statuses": { label: "Purchase order statuses", model: "purchaseOrderStatus", fields: [color] },
  "timesheet-item-types": {
    label: "Timesheet item types",
    model: "timesheetItemType",
    fields: [
      { name: "multiplierBp", label: "Rate multiplier", type: "multiplier", hint: "1 = regular, 1.5 = time and a half, 2 = double time." },
      { name: "billable", label: "Billable", type: "boolean", hint: "Billable time can be invoiced to the customer." },
    ],
  },
  "tax-components": {
    label: "Tax components",
    model: "taxComponent",
    fields: [
      { name: "rateBp", label: "Rate", type: "percent", hint: "e.g. 5 for GST, 6 for SK PST." },
      { name: "registration", label: "Registration number", type: "text", hint: "Printed on invoices, e.g. your GST number." },
    ],
  },
  "tax-levels": {
    label: "Tax levels",
    model: "taxLevel",
    // Components are edited as a checkbox list; see the settings action.
    fields: [{ name: "isDefault", label: "Default for new customers", type: "boolean" }],
  },
  "payment-terms": { label: "Payment terms", model: "paymentTerm", fields: [{ name: "days", label: "Days until due", type: "int" }] },
  "payment-methods": { label: "Payment methods", model: "paymentMethod", fields: [] },
  units: { label: "Units of measure", model: "unitOfMeasure", fields: [] },
  "inventory-categories": { label: "Inventory categories", model: "inventoryCategory", fields: [] },
  trades: { label: "Trades", model: "trade", fields: [] },
  "labor-rates": {
    label: "Labour rates",
    model: "laborRate",
    fields: [
      { name: "costCents", label: "Cost per hour", type: "money", hint: "Wage plus burden; used for job costing." },
      { name: "sellCents", label: "Sell per hour", type: "money", hint: "Billed to customers before multipliers." },
    ],
  },
  "equipment-types": { label: "Equipment types", model: "equipmentType", fields: [] },
} as const satisfies Record<string, { label: string; model: Uncapitalize<Prisma.ModelName>; fields: readonly LookupField[] }>;

export type LookupKey = keyof typeof LOOKUP_TABLES;

export const LOOKUP_KEYS = Object.keys(LOOKUP_TABLES) as LookupKey[];

export function isLookupKey(value: string): value is LookupKey {
  return value in LOOKUP_TABLES;
}

export function lookupFields(key: LookupKey): readonly LookupField[] {
  return LOOKUP_TABLES[key].fields;
}

/** Columns every lookup table shares. */
export interface LookupRow {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

/** A full lookup row as the Settings editor sees it (shared columns + table-specific fields). */
export type LookupRecord = LookupRow & Record<string, unknown>;

/** Codes are stable identifiers the code refers to: upper-case letters, digits, underscores. */
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** "1.5" → 15000 basis points (exact; up to 4 decimals). */
export function parseMultiplierBp(text: string): number {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text.trim().replace(/x$/i, "").trim());
  if (!m) throw new RangeError(`Invalid multiplier: ${text}`);
  return Number(m[1]) * 10_000 + Number((m[2] ?? "").padEnd(4, "0"));
}

export function formatMultiplier(bp: number): string {
  return String(bp / 10_000);
}
