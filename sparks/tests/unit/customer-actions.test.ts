import { beforeEach, describe, expect, it, vi } from "vitest";

// Real form actions with auth, database and navigation mocked.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const tx = {
  customer: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  contact: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  sequence: { update: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    taxLevel: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), update: vi.fn() },
    jobSite: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { createCustomer, deleteCustomer, saveContact } = await import("@/server/actions/customers");

type Mocked = ReturnType<typeof vi.fn>;
const m = (f: unknown) => f as Mocked;

function signInAs(role: "ADMIN" | "OFFICE" | "TECHNICIAN") {
  m(auth).mockResolvedValue({ user: { id: "u1", role } });
  m(db.user.findUnique).mockResolvedValue({ id: "u1", name: "T", email: "t@example.com", role, active: true, employeeId: null });
}

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  m(tx.sequence.update).mockResolvedValue({ prefix: "C", nextValue: 1022, padding: 5 });
  m(tx.customer.create).mockResolvedValue({ id: "cust1" });
});

describe("createCustomer", () => {
  const valid = { name: "  New Co  ", categoryId: "cat1", phone: "3065550123", billingPostal: "s4p3y2" };

  it("creates with the next account number, normalized fields and an audit entry, then redirects", async () => {
    signInAs("OFFICE");
    await expect(createCustomer({}, form(valid))).rejects.toMatchObject({ to: "/customers/cust1" });
    expect(m(tx.customer.create).mock.calls[0][0].data).toMatchObject({
      name: "New Co",
      accountNumber: "C01021",
      phone: "(306) 555-0123",
      billingPostal: "S4P 3Y2",
      creditHold: false,
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("refuses technicians before touching the database", async () => {
    signInAs("TECHNICIAN");
    const state = await createCustomer({}, form(valid));
    expect(state.error).toBe("You don't have permission to do that.");
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it("returns field errors and the submitted values", async () => {
    signInAs("OFFICE");
    const state = await createCustomer({}, form({ name: "", categoryId: "", billingPostal: "99999" }));
    expect(state.fieldErrors).toMatchObject({ name: "Name is required", categoryId: "Choose a category", billingPostal: "Enter a postal code like S4P 3Y2" });
    expect(state.values).toMatchObject({ billingPostal: "99999" });
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it("requires an exemption number for an exempt tax level", async () => {
    signInAs("OFFICE");
    m(db.taxLevel.findUnique).mockResolvedValue({ code: "EXEMPT" });
    const state = await createCustomer({}, form({ ...valid, taxLevelId: "exempt" }));
    expect(state.error).toMatch(/tax exemption number/);
    expect(tx.customer.create).not.toHaveBeenCalled();
  });
});

describe("deleteCustomer", () => {
  it("is administrators only", async () => {
    signInAs("OFFICE");
    expect((await deleteCustomer({}, form({ id: "cust1" }))).error).toBe("You don't have permission to do that.");
  });

  it("refuses customers with history and suggests deactivating", async () => {
    signInAs("ADMIN");
    m(db.customer.findUnique).mockResolvedValue({ name: "X", _count: { jobSites: 1, workOrders: 0, quotes: 0, invoices: 0, projects: 0, serviceAgreements: 0 } });
    const state = await deleteCustomer({}, form({ id: "cust1" }));
    expect(state.error).toMatch(/Deactivate it instead/);
    expect(tx.customer.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused customer and its contacts", async () => {
    signInAs("ADMIN");
    m(db.customer.findUnique).mockResolvedValue({ name: "X", _count: { jobSites: 0, workOrders: 0, quotes: 0, invoices: 0, projects: 0, serviceAgreements: 0 } });
    await expect(deleteCustomer({}, form({ id: "cust1" }))).rejects.toMatchObject({ to: "/customers" });
    expect(tx.contact.deleteMany).toHaveBeenCalledWith({ where: { customerId: "cust1" } });
    expect(tx.customer.delete).toHaveBeenCalledWith({ where: { id: "cust1" } });
  });
});

describe("saveContact", () => {
  it("making a contact primary un-marks the customer's other primary contacts", async () => {
    signInAs("OFFICE");
    m(tx.contact.create).mockResolvedValue({ id: "ct1" });
    const state = await saveContact({}, form({ customerId: "cust1", firstName: "Pat", lastName: "Volt", isPrimary: "on" }));
    expect(state).toMatchObject({ ok: true, message: "Contact added." });
    expect(tx.contact.updateMany).toHaveBeenCalledWith({ where: { customerId: "cust1", isPrimary: true }, data: { isPrimary: false } });
  });

  it("rejects a job site from another customer", async () => {
    signInAs("OFFICE");
    m(db.jobSite.findUnique).mockResolvedValue({ customerId: "someone-else" });
    const state = await saveContact({}, form({ customerId: "cust1", firstName: "Pat", lastName: "Volt", jobSiteId: "site9" }));
    expect(state.error).toBe("That job site belongs to a different customer.");
    expect(tx.contact.create).not.toHaveBeenCalled();
  });
});
