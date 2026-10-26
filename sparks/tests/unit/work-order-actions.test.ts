import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const STATUSES = [
  { id: "s-new", code: "NEW", label: "New", active: true, sortOrder: 10 },
  { id: "s-sched", code: "SCHEDULED", label: "Scheduled", active: true, sortOrder: 20 },
  { id: "s-disp", code: "DISPATCHED", label: "Dispatched", active: true, sortOrder: 30 },
  { id: "s-prog", code: "IN_PROGRESS", label: "In Progress", active: true, sortOrder: 40 },
  { id: "s-done", code: "COMPLETED", label: "Completed", active: true, sortOrder: 60 },
  { id: "s-canc", code: "CANCELLED", label: "Cancelled", active: true, sortOrder: 90 },
];
const TRANSITIONS: Record<string, string[]> = { "s-disp": ["s-prog", "s-sched", "s-canc"], "s-prog": ["s-done", "s-canc"] };

const tx = {
  workOrder: { create: vi.fn(), update: vi.fn() },
  workOrderNote: { create: vi.fn() },
  sequence: { update: vi.fn(), createMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    jobSite: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    employee: { findMany: vi.fn() },
    workOrder: { findFirst: vi.fn() },
    workOrderStatus: {
      findMany: vi.fn(async () => STATUSES),
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => STATUSES.find((s) => s.code === where.code)),
    },
    workOrderStatusTransition: { findMany: vi.fn(async ({ where }: { where: { fromId: string } }) => (TRANSITIONS[where.fromId] ?? []).map((toId) => ({ toId }))) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { changeWorkOrderStatus, createWorkOrder } = await import("@/server/actions/work-orders");
const m = (f: unknown) => f as ReturnType<typeof vi.fn>;

function signInAs(role: "ADMIN" | "OFFICE" | "TECHNICIAN", employeeId: string | null = null) {
  m(auth).mockResolvedValue({ user: { id: "u1", role } });
  m(db.user.findUnique).mockResolvedValue({ id: "u1", name: "T", email: "t@example.com", role, active: true, employeeId });
}
function form(values: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) for (const x of ([] as string[]).concat(v)) fd.append(k, x);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  m(tx.sequence.update).mockResolvedValue({ prefix: "WO-", nextValue: 17, padding: 6 });
  m(tx.workOrder.create).mockResolvedValue({ id: "wo-new" });
  m(db.jobSite.findUnique).mockResolvedValue({ customerId: "cust1", active: true });
  m(db.employee.findMany).mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })));
});

describe("changeWorkOrderStatus", () => {
  it("lets the assigned technician start the job", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    m(db.workOrder.findFirst).mockResolvedValue({ id: "wo1", statusId: "s-disp", status: STATUSES[2], completedAt: null });
    const state = await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-prog" }));
    expect(state).toMatchObject({ ok: true, message: "Status changed to In Progress." });
    // The lookup was scoped to work orders assigned to this technician.
    expect(m(db.workOrder.findFirst).mock.calls[0][0].where.AND[1]).toEqual({ assignments: { some: { employeeId: "emp-marcus" } } });
    expect(tx.workOrderNote.create).toHaveBeenCalledOnce();
  });

  it("refuses a technician on a work order that isn't theirs", async () => {
    signInAs("TECHNICIAN", "emp-other");
    m(db.workOrder.findFirst).mockResolvedValue(null);
    const state = await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-prog" }));
    expect(state.error).toBe("You can't change that work order.");
    expect(tx.workOrder.update).not.toHaveBeenCalled();
  });

  it("refuses moves that Settings doesn't allow, and technicians can't cancel", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    m(db.workOrder.findFirst).mockResolvedValue({ id: "wo1", statusId: "s-disp", status: STATUSES[2], completedAt: null });
    expect((await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-done" }))).error).toMatch(/can't go from Dispatched/);
    expect((await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-canc" }))).error).toMatch(/can't go from Dispatched/);
    expect(tx.workOrder.update).not.toHaveBeenCalled();
  });

  it("lets office cancel, and sets the completion time when completing", async () => {
    signInAs("OFFICE");
    m(db.workOrder.findFirst).mockResolvedValue({ id: "wo1", statusId: "s-prog", status: STATUSES[3], completedAt: null });
    await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-done" }));
    expect(m(tx.workOrder.update).mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    expect((await changeWorkOrderStatus({}, form({ id: "wo1", statusId: "s-canc" }))).ok).toBe(true);
  });
});

describe("createWorkOrder", () => {
  const base = { customerId: "cust1", jobSiteId: "site1", typeId: "t1", priorityId: "p1", summary: "Replace ballast" };

  it("starts as New without crew/time, Scheduled with both, and gets the next number", async () => {
    signInAs("OFFICE");
    await expect(createWorkOrder({}, form(base))).rejects.toMatchObject({ to: "/work-orders/wo-new" });
    expect(m(tx.workOrder.create).mock.calls[0][0].data).toMatchObject({ number: "WO-000016", statusId: "s-new", summary: "Replace ballast" });
    expect(m(tx.workOrder.create).mock.calls[0][0].data.jobNumber).toMatch(/^20\d{2}016$/); // stand-alone: its own job number

    await expect(createWorkOrder({}, form({ ...base, scheduledStart: "2026-11-03T08:00", assigneeIds: ["e1", "e2"], leadEmployeeId: "e2" }))).rejects.toMatchObject({ to: "/work-orders/wo-new" });
    const data = m(tx.workOrder.create).mock.calls[1][0].data;
    expect(data.statusId).toBe("s-sched");
    expect(data.scheduledStart.toISOString()).toBe("2026-11-03T14:00:00.000Z"); // 8:00 Regina
    expect(data.assignments.create).toEqual([{ employeeId: "e1", isLead: false }, { employeeId: "e2", isLead: true }]);
  });

  it("work under a project uses the project's job number instead of getting one", async () => {
    signInAs("OFFICE");
    m(db.project.findUnique).mockResolvedValue({ id: "proj1", customerId: "cust1" } as never);
    await createWorkOrder({}, form({ ...base, projectId: "proj1" })).catch(() => {});
    const data = m(tx.workOrder.create).mock.calls[0]?.[0].data;
    expect(data?.projectId).toBe("proj1");
    expect(data?.jobNumber).toBeNull();
  });

  it("rejects a job site that belongs to another customer", async () => {
    signInAs("OFFICE");
    m(db.jobSite.findUnique).mockResolvedValue({ customerId: "someone-else", active: true });
    const state = await createWorkOrder({}, form(base));
    expect(state.fieldErrors?.jobSiteId).toBe("Choose a job site for this customer");
    expect(tx.workOrder.create).not.toHaveBeenCalled();
  });

  it("is refused for technicians", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    expect((await createWorkOrder({}, form(base))).error).toBe("You don't have permission to do that.");
  });
});
