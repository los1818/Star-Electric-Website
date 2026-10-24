import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    timesheetItemType: { findUnique: vi.fn() },
    workOrder: { findFirst: vi.fn() },
    employee: { findUnique: vi.fn() },
    timeEntry: { aggregate: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { saveTimeEntry, deleteTimeEntry, submitWeek, approveWeek, reopenTimeEntry } = await import("@/server/actions/timesheets");
const m = (f: unknown) => f as ReturnType<typeof vi.fn>;

function signInAs(role: "ADMIN" | "OFFICE" | "TECHNICIAN", employeeId: string | null = null) {
  m(auth).mockResolvedValue({ user: { id: "u1", role } });
  m(db.user.findUnique).mockResolvedValue({ id: "u1", name: "T", email: "t@example.com", role, active: true, employeeId });
}
function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}
const REGULAR = { id: "t-reg", label: "Regular", active: true, billable: true };
const SHOP = { id: "t-shop", label: "Shop Time", active: true, billable: false };

beforeEach(() => {
  vi.clearAllMocks();
  m(db.timesheetItemType.findUnique).mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "t-shop" ? SHOP : REGULAR));
  m(db.workOrder.findFirst).mockResolvedValue({ id: "wo1" });
  m(db.employee.findUnique).mockResolvedValue({ laborRateId: "rate-jp" });
  m(db.timeEntry.aggregate).mockResolvedValue({ _sum: { hoursHundredths: 0 } });
  m(db.timeEntry.create).mockResolvedValue({ id: "te1" });
});

describe("saveTimeEntry", () => {
  it("records a technician's own time with their default rate, ignoring any rate they send", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    const state = await saveTimeEntry({}, form({ date: "2026-10-26", workOrderId: "wo1", itemTypeId: "t-reg", startTime: "07:00", endTime: "15:30", laborRateId: "rate-premium" }));
    expect(state).toMatchObject({ ok: true, message: "Time added." });
    const data = m(db.timeEntry.create).mock.calls[0][0].data;
    expect(data).toMatchObject({ employeeId: "emp-marcus", hoursHundredths: 850, laborRateId: "rate-jp", workOrderId: "wo1" });
    expect(data.startTime.toISOString()).toBe("2026-10-26T13:00:00.000Z"); // 7:00 Regina
    // The work order lookup was limited to the technician's own assignments.
    expect(m(db.workOrder.findFirst).mock.calls[0][0].where.AND[1]).toEqual({ assignments: { some: { employeeId: "emp-marcus" } } });
  });

  it("refuses a technician entering time for someone else", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    const state = await saveTimeEntry({}, form({ employeeId: "emp-jasmine", date: "2026-10-26", itemTypeId: "t-shop", hours: "2" }));
    expect(state.error).toBe("You can only enter your own time.");
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("lets office enter time for anyone", async () => {
    signInAs("OFFICE");
    const state = await saveTimeEntry({}, form({ employeeId: "emp-jasmine", date: "2026-10-26", itemTypeId: "t-shop", hours: "2" }));
    expect(state.ok).toBe(true);
    expect(m(db.timeEntry.create).mock.calls[0][0].data.employeeId).toBe("emp-jasmine");
  });

  it("requires a work order for billable time, and one the technician is on", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    expect((await saveTimeEntry({}, form({ date: "2026-10-26", itemTypeId: "t-reg", hours: "8" }))).fieldErrors?.workOrderId).toBe("Regular time has to be on a work order");
    m(db.workOrder.findFirst).mockResolvedValue(null);
    expect((await saveTimeEntry({}, form({ date: "2026-10-26", itemTypeId: "t-reg", hours: "8", workOrderId: "not-mine" }))).fieldErrors?.workOrderId).toBe("Choose one of your work orders");
  });

  it("checks hours: format, mismatch with start/end, and 24 h per day", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    expect((await saveTimeEntry({}, form({ date: "2026-10-26", itemTypeId: "t-shop", hours: "lots" }))).fieldErrors?.hours).toBe("Enter hours like 7.5 or 7:30");
    expect((await saveTimeEntry({}, form({ date: "2026-10-26", itemTypeId: "t-shop", hours: "8", startTime: "07:00", endTime: "12:00" }))).fieldErrors?.hours).toMatch(/don't match/);
    m(db.timeEntry.aggregate).mockResolvedValue({ _sum: { hoursHundredths: 2000 } });
    expect((await saveTimeEntry({}, form({ date: "2026-10-26", itemTypeId: "t-shop", hours: "5" }))).fieldErrors?.hours).toBe("That would be more than 24 hours on this day");
  });

  it("won't let a technician change submitted time, but office can; nobody changes approved time", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    m(db.timeEntry.findUnique).mockResolvedValue({ id: "te1", employeeId: "emp-marcus", submittedAt: new Date(), approvedAt: null });
    expect((await saveTimeEntry({}, form({ id: "te1", date: "2026-10-26", itemTypeId: "t-shop", hours: "2" }))).error).toMatch(/has been submitted/);
    expect((await deleteTimeEntry({}, form({ id: "te1" }))).error).toMatch(/has been submitted/);

    signInAs("OFFICE");
    expect((await saveTimeEntry({}, form({ id: "te1", employeeId: "emp-marcus", date: "2026-10-26", itemTypeId: "t-shop", hours: "2" }))).ok).toBe(true);

    m(db.timeEntry.findUnique).mockResolvedValue({ id: "te1", employeeId: "emp-marcus", submittedAt: new Date(), approvedAt: new Date() });
    expect((await saveTimeEntry({}, form({ id: "te1", employeeId: "emp-marcus", date: "2026-10-26", itemTypeId: "t-shop", hours: "2" }))).error).toBe("This entry has been approved and is locked.");
  });
});

describe("weeks", () => {
  it("submits only the technician's own drafts", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    m(db.timeEntry.updateMany).mockResolvedValue({ count: 3 });
    expect((await submitWeek({}, form({ weekStart: "2026-10-26" }))).message).toBe("Submitted 3 entries for approval.");
    expect(m(db.timeEntry.updateMany).mock.calls[0][0].where).toMatchObject({ employeeId: "emp-marcus", submittedAt: null });
    expect((await submitWeek({}, form({ weekStart: "2026-10-26", employeeId: "emp-jasmine" }))).error).toBe("You can only enter your own time.");
  });

  it("approval is office/admin only and touches only submitted entries", async () => {
    signInAs("TECHNICIAN", "emp-marcus");
    expect((await approveWeek({}, form({ weekStart: "2026-10-26", employeeId: "emp-marcus" }))).error).toBe("You don't have permission to do that.");
    signInAs("OFFICE");
    m(db.timeEntry.updateMany).mockResolvedValue({ count: 2 });
    await approveWeek({}, form({ weekStart: "2026-10-26", employeeId: "emp-marcus" }));
    expect(m(db.timeEntry.updateMany).mock.calls[0][0].where).toMatchObject({ submittedAt: { not: null }, approvedAt: null });
  });

  it("only administrators reopen approved time, and never invoiced time", async () => {
    signInAs("OFFICE");
    expect((await reopenTimeEntry({}, form({ id: "te1" }))).error).toBe("Only an administrator can reopen approved time.");
    signInAs("ADMIN");
    m(db.timeEntry.findUnique).mockResolvedValue({ id: "te1", invoiceLineId: "line9" });
    expect((await reopenTimeEntry({}, form({ id: "te1" }))).error).toMatch(/has been invoiced/);
  });
});
