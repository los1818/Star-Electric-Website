import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise real server actions + requirePermission with auth and the database mocked out.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    customerCategory: { update: vi.fn() },
    recentItem: { deleteMany: vi.fn() },
  },
}));

const { auth } = await import("@/auth");
const { db } = await import("@/lib/db");
const { updateLookupRow } = await import("@/server/actions/settings");
const { clearRecentItems } = await import("@/server/actions/recent");

type Mocked = ReturnType<typeof vi.fn>;

function signInAs(user: { id: string; role: "ADMIN" | "OFFICE" | "TECHNICIAN"; active?: boolean } | null) {
  (auth as unknown as Mocked).mockResolvedValue(user ? { user: { id: user.id, role: user.role } } : null);
  (db.user.findUnique as unknown as Mocked).mockResolvedValue(
    user ? { id: user.id, name: "Test", email: "t@example.com", role: user.role, active: user.active ?? true, employeeId: null } : null,
  );
}

const validInput = { table: "customer-categories", id: "cat1", label: "Commercial", sortOrder: 10, active: true };

beforeEach(() => {
  vi.clearAllMocks();
  (db.customerCategory.update as unknown as Mocked).mockResolvedValue({ id: "cat1", code: "COMMERCIAL", label: "Commercial", sortOrder: 10, active: true });
});

describe("updateLookupRow (settings:manage)", () => {
  it("lets an administrator edit and writes an audit log", async () => {
    signInAs({ id: "u1", role: "ADMIN" });
    const result = await updateLookupRow(validInput);
    expect(result.ok).toBe(true);
    expect(db.customerCategory.update).toHaveBeenCalledWith({
      where: { id: "cat1" },
      data: { label: "Commercial", sortOrder: 10, active: true },
    });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it.each(["OFFICE", "TECHNICIAN"] as const)("rejects %s without touching the database", async (role) => {
    signInAs({ id: "u2", role });
    const result = await updateLookupRow(validInput);
    expect(result).toEqual({ ok: false, error: "You don't have permission to do that." });
    expect(db.customerCategory.update).not.toHaveBeenCalled();
  });

  it("rejects signed-out callers", async () => {
    signInAs(null);
    expect((await updateLookupRow(validInput)).ok).toBe(false);
    expect(db.customerCategory.update).not.toHaveBeenCalled();
  });

  it("uses the role in the database, not the session (deactivated admin is rejected)", async () => {
    signInAs({ id: "u3", role: "ADMIN", active: false });
    expect((await updateLookupRow(validInput)).ok).toBe(false);
    expect(db.customerCategory.update).not.toHaveBeenCalled();
  });

  it("uses the role in the database, not the session (demoted user is rejected)", async () => {
    (auth as unknown as Mocked).mockResolvedValue({ user: { id: "u4", role: "ADMIN" } });
    (db.user.findUnique as unknown as Mocked).mockResolvedValue({ id: "u4", name: null, email: "x@example.com", role: "OFFICE", active: true, employeeId: null });
    expect((await updateLookupRow(validInput)).ok).toBe(false);
  });

  it("validates input after the permission check", async () => {
    signInAs({ id: "u1", role: "ADMIN" });
    const blank = await updateLookupRow({ ...validInput, label: "  " });
    expect(blank).toEqual({ ok: false, error: "Label is required" });
    const badTable = await updateLookupRow({ ...validInput, table: "users" });
    expect(badTable.ok).toBe(false);
    expect(db.customerCategory.update).not.toHaveBeenCalled();
  });
});

describe("clearRecentItems (any signed-in user)", () => {
  it("only clears the caller's own items", async () => {
    signInAs({ id: "tech1", role: "TECHNICIAN" });
    expect((await clearRecentItems({})).ok).toBe(true);
    expect(db.recentItem.deleteMany).toHaveBeenCalledWith({ where: { userId: "tech1" } });
  });

  it("rejects signed-out callers", async () => {
    signInAs(null);
    expect((await clearRecentItems({})).ok).toBe(false);
    expect(db.recentItem.deleteMany).not.toHaveBeenCalled();
  });
});
