// Role → permission map. Pure (no Next/DB imports) so it can be unit-tested and used in
// both server and client code. Enforcement lives in ./server.ts. See docs/SPEC.md §2.

/** PENDING = signed in with company SSO, waiting for an administrator to assign a role. */
export const ROLES = ["ADMIN", "OFFICE", "TECHNICIAN", "PENDING"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  OFFICE: "Office",
  TECHNICIAN: "Technician",
  PENDING: "Awaiting access",
};

export const PERMISSIONS = [
  "dashboard:view",
  "search:use",
  "dispatch:manage",
  "workorders:read_all",
  "workorders:read_assigned",
  "workorders:write",
  /** Move a work order through its allowed statuses (technicians: only their assigned ones). */
  "workorders:update_status",
  "workorders:add_notes",
  "workorders:delete",
  "projects:read",
  "projects:write",
  /** Progress invoices, holdback release, change order approval. */
  "projects:billing",
  "customers:read",
  "customers:write",
  "customers:delete",
  "jobsites:read",
  "jobsites:write",
  "jobsites:delete",
  "quotes:read",
  "quotes:write",
  "quotes:delete",
  "invoices:read",
  "invoices:write",
  "invoices:post",
  "invoices:void",
  "invoices:delete",
  "purchaseorders:read",
  "purchaseorders:write",
  "inventory:read",
  "inventory:write",
  "equipment:read",
  "equipment:write",
  "agreements:read",
  "agreements:write",
  "timesheets:read_own",
  "timesheets:write_own",
  "timesheets:read_all",
  "timesheets:write_all",
  "timesheets:approve",
  "employees:read",
  "employees:write",
  "vendors:read",
  "vendors:write",
  "reports:operational",
  "reports:financial",
  /** Costs, sell prices and rates anywhere in the app. Technicians never get this. */
  "pricing:view",
  "settings:manage",
  "users:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OFFICE: Permission[] = [
  "dashboard:view",
  "search:use",
  "dispatch:manage",
  "projects:read",
  "projects:write",
  "projects:billing",
  "workorders:read_all",
  "workorders:read_assigned",
  "workorders:write",
  "workorders:update_status",
  "workorders:add_notes",
  "customers:read",
  "customers:write",
  "jobsites:read",
  "jobsites:write",
  "quotes:read",
  "quotes:write",
  "invoices:read",
  "invoices:write",
  "invoices:post",
  "purchaseorders:read",
  "purchaseorders:write",
  "inventory:read",
  "inventory:write",
  "equipment:read",
  "equipment:write",
  "agreements:read",
  "agreements:write",
  "timesheets:read_own",
  "timesheets:write_own",
  "timesheets:read_all",
  "timesheets:write_all",
  "timesheets:approve",
  "employees:read",
  "vendors:read",
  "vendors:write",
  "reports:operational",
  "pricing:view",
];

// Technicians see customer/site contact details through their assigned work orders, never prices.
const TECHNICIAN: Permission[] = [
  "dashboard:view",
  "search:use",
  "workorders:read_assigned",
  "workorders:update_status",
  "workorders:add_notes",
  "inventory:read",
  "equipment:read",
  "timesheets:read_own",
  "timesheets:write_own",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  OFFICE: new Set(OFFICE),
  TECHNICIAN: new Set(TECHNICIAN),
  PENDING: new Set(),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role || !isRole(role)) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function canAny(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission | "authenticated") {
    super(`Forbidden: missing ${permission}`);
    this.name = "ForbiddenError";
  }
}
