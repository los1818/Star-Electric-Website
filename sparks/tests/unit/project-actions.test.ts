import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const tx = {
  changeOrder: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
  scheduleOfValuesLine: { create: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    changeOrder: { findUnique: vi.fn() },
    changeOrderStatus: { findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `st-${where.code}`, code: where.code, label: where.code[0] + where.code.slice(1).toLowerCase() })) },
    scheduleOfValuesLine: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { createChangeOrder, decideChangeOrder, saveSovLine, deleteSovLine } = await import("@/server/actions/projects");
const m = (f: unknown) => f as ReturnType<typeof vi.fn>;

function signInAs(role: "ADMIN" | "OFFICE" | "TECHNICIAN") {
  m(auth).mockResolvedValue({ user: { id: "u1", role } });
  m(db.user.findUnique).mockResolvedValue({ id: "u1", name: "T", email: "t@example.com", role, active: true, employeeId: null });
}
function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("change orders", () => {
  it("numbers change orders per project and allows credits", async () => {
    signInAs("OFFICE");
    m(tx.changeOrder.count).mockResolvedValue(2);
    m(tx.changeOrder.create).mockImplementation(async ({ data }) => data);
    const state = await createChangeOrder({}, form({ projectId: "p1", title: "Credit: owner-supplied disconnect", amountCents: "-1,500" }));
    expect(state).toMatchObject({ ok: true, message: "CO-003 added as Pending." });
    expect(m(tx.changeOrder.create).mock.calls[0][0].data).toMatchObject({ number: "CO-003", amountCents: -150000, statusId: "st-PENDING" });
  });

  it("approves a pending change order and adds it to the schedule of values", async () => {
    signInAs("OFFICE");
    m(db.changeOrder.findUnique).mockResolvedValue({ id: "co1", projectId: "p1", number: "CO-001", title: "Extra circuits", amountCents: 785000, status: { code: "PENDING", label: "Pending" } });
    const state = await decideChangeOrder({}, form({ id: "co1", decision: "APPROVED", addToSov: "on" }));
    expect(state.ok).toBe(true);
    expect(m(tx.changeOrder.update).mock.calls[0][0].data.statusId).toBe("st-APPROVED");
    expect(tx.scheduleOfValuesLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "p1", scheduledValueCents: 785000, changeOrderId: "co1" }) });
  });

  it("won't decide a change order twice", async () => {
    signInAs("ADMIN");
    m(db.changeOrder.findUnique).mockResolvedValue({ id: "co1", projectId: "p1", number: "CO-001", amountCents: 1, status: { code: "APPROVED", label: "Approved" } });
    expect((await decideChangeOrder({}, form({ id: "co1", decision: "REJECTED" }))).error).toBe("CO-001 is already approved.");
    expect(tx.changeOrder.update).not.toHaveBeenCalled();
  });

  it("is off limits to technicians", async () => {
    signInAs("TECHNICIAN");
    expect((await createChangeOrder({}, form({ projectId: "p1", title: "x", amountCents: "1" }))).error).toBe("You don't have permission to do that.");
    expect((await decideChangeOrder({}, form({ id: "co1", decision: "APPROVED" }))).error).toBe("You don't have permission to do that.");
  });
});

describe("schedule of values", () => {
  it("refuses to change the value of a line that has been billed", async () => {
    signInAs("OFFICE");
    m(db.scheduleOfValuesLine.findUnique).mockResolvedValue({ id: "l1", projectId: "p1", scheduledValueCents: 960000, _count: { progressLines: 1 } });
    const state = await saveSovLine({}, form({ id: "l1", projectId: "p1", description: "Rough-in", scheduledValueCents: "10000", sortOrder: "10" }));
    expect(state.error).toMatch(/has been billed/);
    expect(db.scheduleOfValuesLine.update).not.toHaveBeenCalled();
    // Renaming without changing the value is fine.
    const ok = await saveSovLine({}, form({ id: "l1", projectId: "p1", description: "Rough-in (all floors)", scheduledValueCents: "9600", sortOrder: "10" }));
    expect(ok.ok).toBe(true);
  });

  it("won't delete a billed line", async () => {
    signInAs("OFFICE");
    m(db.scheduleOfValuesLine.findUnique).mockResolvedValue({ id: "l1", projectId: "p1", description: "x", _count: { progressLines: 2 } });
    expect((await deleteSovLine({}, form({ id: "l1" }))).error).toMatch(/can't be removed/);
    expect(db.scheduleOfValuesLine.delete).not.toHaveBeenCalled();
  });
});
