import type { PrismaClient } from "@prisma/client";

// Default lookup rows. Upserted by `code`: re-running updates nothing a user has edited
// except when a row is missing, so this is safe to run against production to bootstrap.

type Row = { code: string; label: string } & Record<string, unknown>;

const withOrder = <T extends Row>(rows: T[]) => rows.map((r, i) => ({ ...r, sortOrder: (i + 1) * 10 }));

export const CUSTOMER_CATEGORIES = withOrder([
  { code: "COMMERCIAL", label: "Commercial", color: "#2563eb" },
  { code: "INDUSTRIAL", label: "Industrial", color: "#7c3aed" },
  { code: "INSTITUTIONAL", label: "Institutional", color: "#059669" },
  { code: "PROPERTY_MGMT", label: "Property Management", color: "#d97706" },
  { code: "GENERAL_CONTRACTOR", label: "General Contractor", color: "#dc2626" },
]);

export const WORK_ORDER_TYPES = withOrder([
  { code: "SERVICE", label: "Service Call", color: "#2563eb" },
  { code: "PROJECT", label: "Project", color: "#7c3aed" },
  { code: "MAINTENANCE", label: "Maintenance", color: "#059669" },
  { code: "EMERGENCY", label: "Emergency", color: "#dc2626" },
  { code: "INSPECTION", label: "Inspection", color: "#0891b2" },
  { code: "WARRANTY", label: "Warranty", color: "#6b7280" },
]);

export const WORK_ORDER_STATUSES = withOrder([
  { code: "NEW", label: "New", color: "#6b7280", isClosed: false, isBillable: false },
  { code: "SCHEDULED", label: "Scheduled", color: "#2563eb", isClosed: false, isBillable: false },
  { code: "DISPATCHED", label: "Dispatched", color: "#0891b2", isClosed: false, isBillable: false },
  { code: "IN_PROGRESS", label: "In Progress", color: "#d97706", isClosed: false, isBillable: false },
  { code: "ON_HOLD", label: "On Hold", color: "#9333ea", isClosed: false, isBillable: false },
  { code: "COMPLETED", label: "Completed", color: "#059669", isClosed: false, isBillable: true },
  { code: "INVOICED", label: "Invoiced", color: "#065f46", isClosed: false, isBillable: false },
  { code: "CLOSED", label: "Closed", color: "#111827", isClosed: true, isBillable: false },
  { code: "CANCELLED", label: "Cancelled", color: "#991b1b", isClosed: true, isBillable: false },
]);

/** Allowed status changes (SPEC §5 work order lifecycle). */
export const WORK_ORDER_TRANSITIONS: [string, string[]][] = [
  ["NEW", ["SCHEDULED", "ON_HOLD", "CANCELLED"]],
  ["SCHEDULED", ["DISPATCHED", "NEW", "ON_HOLD", "CANCELLED"]],
  ["DISPATCHED", ["IN_PROGRESS", "SCHEDULED", "ON_HOLD", "CANCELLED"]],
  ["IN_PROGRESS", ["COMPLETED", "ON_HOLD", "CANCELLED"]],
  ["ON_HOLD", ["NEW", "SCHEDULED", "IN_PROGRESS", "CANCELLED"]],
  ["COMPLETED", ["INVOICED", "IN_PROGRESS", "CLOSED"]],
  ["INVOICED", ["CLOSED"]],
  ["CLOSED", []],
  ["CANCELLED", ["NEW"]],
];

export const PRIORITIES = withOrder([
  { code: "LOW", label: "Low", color: "#6b7280" },
  { code: "NORMAL", label: "Normal", color: "#2563eb" },
  { code: "HIGH", label: "High", color: "#d97706" },
  { code: "EMERGENCY", label: "Emergency", color: "#dc2626" },
]);

export const PROJECT_STATUSES = withOrder([
  { code: "BIDDING", label: "Bidding", color: "#6b7280", isClosed: false },
  { code: "AWARDED", label: "Awarded", color: "#2563eb", isClosed: false },
  { code: "IN_PROGRESS", label: "In Progress", color: "#d97706", isClosed: false },
  { code: "SUBSTANTIALLY_COMPLETE", label: "Substantially Complete", color: "#0891b2", isClosed: false },
  { code: "COMPLETE", label: "Complete", color: "#059669", isClosed: false },
  { code: "CLOSED", label: "Closed", color: "#111827", isClosed: true },
  { code: "CANCELLED", label: "Cancelled", color: "#991b1b", isClosed: true },
]);

export const CHANGE_ORDER_STATUSES = withOrder([
  { code: "PENDING", label: "Pending", color: "#d97706", isApproved: false },
  { code: "APPROVED", label: "Approved", color: "#059669", isApproved: true },
  { code: "REJECTED", label: "Rejected", color: "#991b1b", isApproved: false },
  { code: "VOID", label: "Void", color: "#6b7280", isApproved: false },
]);

export const QUOTE_STATUSES = withOrder([
  { code: "DRAFT", label: "Draft", color: "#6b7280" },
  { code: "SENT", label: "Sent", color: "#2563eb" },
  { code: "ACCEPTED", label: "Accepted", color: "#059669" },
  { code: "DECLINED", label: "Declined", color: "#dc2626" },
  { code: "EXPIRED", label: "Expired", color: "#9ca3af" },
]);

export const INVOICE_STATUSES = withOrder([
  { code: "DRAFT", label: "Draft", color: "#6b7280", isPosted: false },
  { code: "POSTED", label: "Posted", color: "#2563eb", isPosted: true },
  { code: "SENT", label: "Sent", color: "#0891b2", isPosted: true },
  { code: "PARTIALLY_PAID", label: "Partially Paid", color: "#d97706", isPosted: true },
  { code: "PAID", label: "Paid", color: "#059669", isPosted: true },
  { code: "VOID", label: "Void", color: "#991b1b", isPosted: true },
]);

export const PURCHASE_ORDER_STATUSES = withOrder([
  { code: "DRAFT", label: "Draft" },
  { code: "ORDERED", label: "Ordered" },
  { code: "PARTIALLY_RECEIVED", label: "Partially Received" },
  { code: "RECEIVED", label: "Received" },
  { code: "CLOSED", label: "Closed" },
]);

export const TIMESHEET_ITEM_TYPES = withOrder([
  { code: "REGULAR", label: "Regular", multiplierBp: 10000, billable: true },
  { code: "OT_15", label: "Overtime 1.5x", multiplierBp: 15000, billable: true },
  { code: "DOUBLE", label: "Double Time", multiplierBp: 20000, billable: true },
  { code: "TRAVEL", label: "Travel", multiplierBp: 10000, billable: true },
  { code: "SHOP", label: "Shop Time", multiplierBp: 10000, billable: false },
  { code: "STAT", label: "Stat Holiday", multiplierBp: 10000, billable: false },
]);

export const TAX_COMPONENTS = withOrder([
  { code: "GST", label: "GST", rateBp: 500 },
  { code: "PST", label: "SK PST", rateBp: 600 },
]);

export const TAX_LEVELS: (Row & { components: string[]; isDefault?: boolean })[] = withOrder([
  { code: "GST_PST", label: "GST + PST", components: ["GST", "PST"], isDefault: true },
  { code: "GST_ONLY", label: "GST only", components: ["GST"] },
  { code: "PST_ONLY", label: "PST only", components: ["PST"] },
  { code: "EXEMPT", label: "Exempt", components: [] },
]);

export const PAYMENT_TERMS = withOrder([
  { code: "DUE_ON_RECEIPT", label: "Due on Receipt", days: 0 },
  { code: "NET15", label: "Net 15", days: 15 },
  { code: "NET30", label: "Net 30", days: 30 },
  { code: "NET45", label: "Net 45", days: 45 },
]);

export const PAYMENT_METHODS = withOrder([
  { code: "CHEQUE", label: "Cheque" },
  { code: "EFT", label: "EFT" },
  { code: "CREDIT_CARD", label: "Credit Card" },
  { code: "CASH", label: "Cash" },
]);

export const UNITS = withOrder([
  { code: "EA", label: "each" },
  { code: "FT", label: "foot" },
  { code: "M", label: "metre" },
  { code: "BOX", label: "box" },
  { code: "ROLL", label: "roll" },
  { code: "PKG", label: "package" },
  { code: "HR", label: "hour" },
]);

export const INVENTORY_CATEGORIES = withOrder([
  { code: "WIRE", label: "Wire & Cable" },
  { code: "CONDUIT", label: "Conduit & Fittings" },
  { code: "BOXES", label: "Boxes & Covers" },
  { code: "DEVICES", label: "Devices" },
  { code: "BREAKERS", label: "Breakers & Panels" },
  { code: "LIGHTING", label: "Lighting" },
  { code: "FASTENERS", label: "Fasteners & Supports" },
  { code: "MISC", label: "Miscellaneous" },
]);

export const TRADES = withOrder([
  { code: "JOURNEYPERSON", label: "Journeyperson Electrician" },
  { code: "APPRENTICE_1", label: "Apprentice (1st year)" },
  { code: "APPRENTICE_2", label: "Apprentice (2nd year)" },
  { code: "APPRENTICE_3", label: "Apprentice (3rd year)" },
  { code: "APPRENTICE_4", label: "Apprentice (4th year)" },
  { code: "FOREMAN", label: "Foreman" },
]);

// Placeholder rates: replace with Star Electric's real rates.
export const LABOR_RATES = withOrder([
  { code: "JOURNEYPERSON", label: "Journeyperson", costCents: 5200, sellCents: 11500 },
  { code: "APPRENTICE", label: "Apprentice", costCents: 3200, sellCents: 8500 },
  { code: "FOREMAN", label: "Foreman", costCents: 6000, sellCents: 12500 },
  { code: "AFTER_HOURS", label: "After-hours (Journeyperson)", costCents: 7800, sellCents: 17250 },
]);

export const EQUIPMENT_TYPES = withOrder([
  { code: "PANEL", label: "Panelboard" },
  { code: "SWITCHGEAR", label: "Switchgear" },
  { code: "TRANSFORMER", label: "Transformer" },
  { code: "GENERATOR", label: "Generator" },
  { code: "ATS", label: "Transfer Switch" },
  { code: "UPS", label: "UPS" },
  { code: "LIGHTING_CONTROL", label: "Lighting Control" },
  { code: "EMERGENCY_LIGHTING", label: "Emergency Lighting" },
  { code: "FIRE_ALARM", label: "Fire Alarm Panel" },
  { code: "EV_CHARGER", label: "EV Charger" },
]);

// Typical electrical-contractor starting points (higher on small service work, lower on large
// projects) until Star Electric sets its own in Settings → Markup tiers.
export const MARKUP_TIERS = [
  { minMaterialCostCents: 0, markupBp: 4000 }, // service calls, small jobs
  { minMaterialCostCents: 100_000, markupBp: 3000 }, // $1,000+
  { minMaterialCostCents: 500_000, markupBp: 2000 }, // $5,000+
  { minMaterialCostCents: 2_500_000, markupBp: 1500 }, // $25,000+ (projects)
];

export const SEQUENCES = [
  { code: "WORK_ORDER", prefix: "WO-", nextValue: 1, padding: 6 },
  { code: "QUOTE", prefix: "Q-", nextValue: 1, padding: 6 },
  { code: "INVOICE", prefix: "INV-", nextValue: 1, padding: 6 },
  { code: "PURCHASE_ORDER", prefix: "PO-", nextValue: 1, padding: 6 },
  { code: "PROJECT", prefix: "P-", nextValue: 1, padding: 4 },
  { code: "CUSTOMER", prefix: "C", nextValue: 1001, padding: 5 },
  { code: "EMPLOYEE", prefix: "E", nextValue: 101, padding: 4 },
  { code: "SERVICE_AGREEMENT", prefix: "SA-", nextValue: 1, padding: 4 },
];

export const COMPANY_SETTINGS: Record<string, string> = {
  "company.name": "Star Electric Corp.",
  "company.city": "Regina",
  "company.province": "SK",
  "company.timezone": "America/Regina",
  "company.gstNumber": "",
  "invoice.footer": "Thank you for your business.",
};

// Prisma delegates have no common type; `any` is confined to this seed helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertAll(delegate: { upsert(args: any): Promise<unknown> }, rows: Row[]) {
  for (const row of rows) {
    await delegate.upsert({ where: { code: row.code }, create: row, update: {} });
  }
}

export async function seedLookups(db: PrismaClient): Promise<void> {
  await upsertAll(db.customerCategory, CUSTOMER_CATEGORIES);
  await upsertAll(db.workOrderType, WORK_ORDER_TYPES);
  await upsertAll(db.workOrderStatus, WORK_ORDER_STATUSES);
  await upsertAll(db.priority, PRIORITIES);
  await upsertAll(db.projectStatus, PROJECT_STATUSES);
  await upsertAll(db.changeOrderStatus, CHANGE_ORDER_STATUSES);
  await upsertAll(db.quoteStatus, QUOTE_STATUSES);
  await upsertAll(db.invoiceStatus, INVOICE_STATUSES);
  await upsertAll(db.purchaseOrderStatus, PURCHASE_ORDER_STATUSES);
  await upsertAll(db.timesheetItemType, TIMESHEET_ITEM_TYPES);
  await upsertAll(db.taxComponent, TAX_COMPONENTS);
  await upsertAll(db.paymentTerm, PAYMENT_TERMS);
  await upsertAll(db.paymentMethod, PAYMENT_METHODS);
  await upsertAll(db.unitOfMeasure, UNITS);
  await upsertAll(db.inventoryCategory, INVENTORY_CATEGORIES);
  await upsertAll(db.trade, TRADES);
  await upsertAll(db.laborRate, LABOR_RATES);
  await upsertAll(db.equipmentType, EQUIPMENT_TYPES);

  const components = new Map((await db.taxComponent.findMany()).map((c) => [c.code, c.id]));
  for (const { components: codes, ...level } of TAX_LEVELS) {
    const existing = await db.taxLevel.findUnique({ where: { code: level.code } });
    if (existing) continue;
    await db.taxLevel.create({
      data: {
        ...(level as { code: string; label: string; sortOrder: number; isDefault?: boolean }),
        components: { create: codes.map((code) => ({ taxComponentId: components.get(code)! })) },
      },
    });
  }

  const statuses = new Map((await db.workOrderStatus.findMany()).map((s) => [s.code, s.id]));
  for (const [from, tos] of WORK_ORDER_TRANSITIONS) {
    for (const to of tos) {
      await db.workOrderStatusTransition.upsert({
        where: { fromId_toId: { fromId: statuses.get(from)!, toId: statuses.get(to)! } },
        create: { fromId: statuses.get(from)!, toId: statuses.get(to)! },
        update: {},
      });
    }
  }

  // Only when none exist, so edits made in Settings are never overwritten.
  if ((await db.markupTier.count()) === 0) await db.markupTier.createMany({ data: MARKUP_TIERS });

  for (const seq of SEQUENCES) {
    await db.sequence.upsert({ where: { code: seq.code }, create: seq, update: {} });
  }
  for (const [key, value] of Object.entries(COMPANY_SETTINGS)) {
    await db.companySetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}
