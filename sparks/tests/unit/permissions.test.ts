import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, canAny, isRole } from "@/lib/auth/permissions";
import { NAV_ITEMS, visibleNavItems } from "@/lib/nav";
import { allowedEmailDomains, isAllowedEmail } from "@/lib/auth/config";

describe("role permissions", () => {
  it("gives administrators every permission", () => {
    for (const p of PERMISSIONS) expect(can("ADMIN", p)).toBe(true);
  });

  it("keeps settings, users and deletes away from Office", () => {
    expect(can("OFFICE", "settings:manage")).toBe(false);
    expect(can("OFFICE", "users:manage")).toBe(false);
    expect(can("OFFICE", "invoices:delete")).toBe(false);
    expect(can("OFFICE", "invoices:void")).toBe(false);
    expect(can("OFFICE", "reports:financial")).toBe(false);
    expect(can("OFFICE", "invoices:post")).toBe(true);
    expect(can("OFFICE", "timesheets:approve")).toBe(true);
  });

  it("limits technicians to their own work", () => {
    expect(can("TECHNICIAN", "workorders:read_assigned")).toBe(true);
    expect(can("TECHNICIAN", "workorders:read_all")).toBe(false);
    expect(can("TECHNICIAN", "timesheets:write_own")).toBe(true);
    expect(can("TECHNICIAN", "timesheets:approve")).toBe(false);
    for (const p of ["invoices:read", "quotes:read", "settings:manage", "customers:write", "dispatch:manage"] as const) {
      expect(can("TECHNICIAN", p)).toBe(false);
    }
  });

  it("never shows prices to technicians", () => {
    expect(can("TECHNICIAN", "pricing:view")).toBe(false);
    expect(can("OFFICE", "pricing:view")).toBe(true);
    expect(can("ADMIN", "pricing:view")).toBe(true);
  });

  it("gives users awaiting access no permissions at all", () => {
    expect(ROLE_PERMISSIONS.PENDING.size).toBe(0);
    for (const p of PERMISSIONS) expect(can("PENDING", p)).toBe(false);
    expect(visibleNavItems("PENDING")).toEqual([]);
  });

  it("denies unknown or missing roles", () => {
    expect(can(undefined, "dashboard:view")).toBe(false);
    expect(can(null, "dashboard:view")).toBe(false);
    // @ts-expect-error: deliberately invalid role
    expect(can("SUPERUSER", "dashboard:view")).toBe(false);
    expect(isRole("OFFICE")).toBe(true);
    expect(isRole("office")).toBe(false);
  });

  it("canAny matches if any permission is held", () => {
    expect(canAny("TECHNICIAN", ["invoices:read", "workorders:read_assigned"])).toBe(true);
    expect(canAny("TECHNICIAN", ["invoices:read", "quotes:read"])).toBe(false);
  });

  it("is a subset hierarchy: pending ⊂ technician ⊂ office ⊂ admin", () => {
    for (const p of ROLE_PERMISSIONS.TECHNICIAN) expect(can("OFFICE", p)).toBe(true);
    for (const p of ROLE_PERMISSIONS.OFFICE) expect(can("ADMIN", p)).toBe(true);
  });
});

describe("sidebar visibility", () => {
  it("shows every module to administrators", () => {
    expect(visibleNavItems("ADMIN")).toHaveLength(NAV_ITEMS.length);
  });

  it("hides financial and settings modules from technicians", () => {
    const hrefs = visibleNavItems("TECHNICIAN").map((i) => i.href);
    expect(hrefs).toContain("/work-orders");
    expect(hrefs).toContain("/timesheets");
    expect(hrefs).not.toContain("/invoices");
    expect(hrefs).not.toContain("/quotes");
    expect(hrefs).not.toContain("/settings");
  });

  it("hides settings from office", () => {
    expect(visibleNavItems("OFFICE").map((i) => i.href)).not.toContain("/settings");
  });
});

describe("SSO email domain check", () => {
  const domains = allowedEmailDomains("starelectric.ca");

  it("allows company addresses, case-insensitively", () => {
    expect(isAllowedEmail("dana@starelectric.ca", domains)).toBe(true);
    expect(isAllowedEmail("Dana@StarElectric.CA", domains)).toBe(true);
  });

  it("rejects other domains and look-alikes", () => {
    expect(isAllowedEmail("dana@gmail.com", domains)).toBe(false);
    expect(isAllowedEmail("dana@evil-starelectric.ca", domains)).toBe(false);
    expect(isAllowedEmail("dana@starelectric.ca.evil.com", domains)).toBe(false);
    expect(isAllowedEmail("starelectric.ca", domains)).toBe(false);
    expect(isAllowedEmail("@starelectric.ca", domains)).toBe(false);
    expect(isAllowedEmail("", domains)).toBe(false);
    expect(isAllowedEmail(undefined, domains)).toBe(false);
  });

  it("parses a comma-separated list", () => {
    expect(allowedEmailDomains(" StarElectric.ca, @example.com ,")).toEqual(["starelectric.ca", "example.com"]);
  });
});
