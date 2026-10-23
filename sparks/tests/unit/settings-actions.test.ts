import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const delegate = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
const tx = {
  laborRate: delegate,
  paymentTerm: delegate,
  taxLevel: { ...delegate, updateMany: vi.fn() },
  timesheetItemType: delegate,
  taxLevelComponent: { deleteMany: vi.fn(), createMany: vi.fn() },
  companySetting: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { saveLookupRow, saveCompanySettings } = await import("@/server/actions/settings");
const m = (f: unknown) => f as ReturnType<typeof vi.fn>;

function signInAs(role: "ADMIN" | "OFFICE") {
  m(auth).mockResolvedValue({ user: { id: "u1", role } });
  m(db.user.findUnique).mockResolvedValue({ id: "u1", name: "T", email: "t@example.com", role, active: true, employeeId: null });
}
function form(values: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) for (const x of ([] as string[]).concat(v)) fd.append(k, x);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  delegate.create.mockImplementation(({ data }) => ({ id: "new1", ...data }));
  delegate.update.mockImplementation(({ data }) => ({ id: "row1", ...data }));
  delegate.findUnique.mockResolvedValue({ id: "row1", code: "X", label: "Old", sortOrder: 10, active: true });
});

describe("saveLookupRow", () => {
  it("is administrators only", async () => {
    signInAs("OFFICE");
    const state = await saveLookupRow({}, form({ table: "labor-rates", label: "Journeyperson", sortOrder: "10", costCents: "52", sellCents: "115" }));
    expect(state.error).toBe("You don't have permission to do that.");
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it("creates a labour rate with a normalized code and money in cents", async () => {
    signInAs("ADMIN");
    const state = await saveLookupRow({}, form({ table: "labor-rates", code: "lead hand", label: "Lead hand", sortOrder: "25", active: "on", costCents: "58.50", sellCents: "$120" }));
    expect(state).toMatchObject({ ok: true, message: "Added “Lead hand”." });
    expect(delegate.create).toHaveBeenCalledWith({ data: { code: "LEAD_HAND", label: "Lead hand", sortOrder: 25, active: true, costCents: 5850, sellCents: 12000 } });
  });

  it("never changes the code when editing", async () => {
    signInAs("ADMIN");
    await saveLookupRow({}, form({ table: "payment-terms", id: "row1", code: "HACKED", label: "Net 60", sortOrder: "40", active: "on", days: "60" }));
    expect(delegate.update).toHaveBeenCalledWith({ where: { id: "row1" }, data: { label: "Net 60", sortOrder: 40, active: true, days: 60 } });
  });

  it("parses timesheet multipliers exactly", async () => {
    signInAs("ADMIN");
    await saveLookupRow({}, form({ table: "timesheet-item-types", id: "row1", label: "OT", sortOrder: "20", active: "on", multiplierBp: "1.5", billable: "on" }));
    expect(delegate.update.mock.calls[0][0].data).toMatchObject({ multiplierBp: 15000, billable: true });
  });

  it("returns per-field errors for bad values", async () => {
    signInAs("ADMIN");
    const state = await saveLookupRow({}, form({ table: "labor-rates", id: "row1", label: "", sortOrder: "10", costCents: "lots", sellCents: "" }));
    expect(state.fieldErrors).toMatchObject({ label: "Label is required", costCents: "Cost per hour must be an amount like 125.00", sellCents: "Sell per hour is required" });
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it("rejects unknown tables", async () => {
    signInAs("ADMIN");
    const state = await saveLookupRow({}, form({ table: "users", label: "x", sortOrder: "1" }));
    expect(state.fieldErrors?.table).toBeTruthy();
  });

  it("sets tax level components and keeps a single default", async () => {
    signInAs("ADMIN");
    await saveLookupRow({}, form({ table: "tax-levels", id: "row1", label: "GST only", sortOrder: "20", active: "on", isDefault: "on", components: ["gst"] }));
    expect(tx.taxLevel.updateMany).toHaveBeenCalledWith({ where: { isDefault: true, NOT: { id: "row1" } }, data: { isDefault: false } });
    expect(tx.taxLevelComponent.deleteMany).toHaveBeenCalledWith({ where: { taxLevelId: "row1" } });
    expect(tx.taxLevelComponent.createMany).toHaveBeenCalledWith({ data: [{ taxLevelId: "row1", taxComponentId: "gst" }] });
  });

  it("won't let the default tax level be inactive", async () => {
    signInAs("ADMIN");
    const state = await saveLookupRow({}, form({ table: "tax-levels", id: "row1", label: "GST + PST", sortOrder: "10", isDefault: "on" }));
    expect(state.error).toBe("The default tax level must be active.");
  });
});

describe("saveCompanySettings", () => {
  it("saves every company field, normalizing postal code and phone", async () => {
    signInAs("ADMIN");
    const state = await saveCompanySettings({}, form({ companyName: "Star Electric Corp.", companyPostal: "s4p3y2", companyPhone: "3065550100", gstNumber: "123456789RT0001" }));
    expect(state.ok).toBe(true);
    const saved = Object.fromEntries(tx.companySetting.upsert.mock.calls.map(([a]) => [a.where.key, a.update.value]));
    expect(saved).toMatchObject({ "company.name": "Star Electric Corp.", "company.postal": "S4P 3Y2", "company.phone": "(306) 555-0100", "company.gstNumber": "123456789RT0001", "company.street": "" });
  });
});
