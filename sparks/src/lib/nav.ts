import { canAny, type Permission, type Role } from "./auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Visible if the user holds any of these. */
  permissions: Permission[];
  /** Phase in docs/SPEC.md §8 that builds the module. */
  phase: number;
  description: string;
}

// Sidebar modules, in SPEC §3 order.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▦", permissions: ["dashboard:view"], phase: 2, description: "Today's work, overdue work orders, unbilled work and open quotes." },
  { href: "/dispatch", label: "Dispatch Board", icon: "◷", permissions: ["dispatch:manage"], phase: 2, description: "Crew schedules: assign electricians to work orders and projects by day." },
  { href: "/work-orders", label: "Work Orders", icon: "⚡", permissions: ["workorders:read_all", "workorders:read_assigned"], phase: 2, description: "Service calls, projects, maintenance and inspections." },
  { href: "/projects", label: "Projects", icon: "▣", permissions: ["projects:read"], phase: 2, description: "Contract jobs: contract value, change orders, schedule of values, progress billing and holdback." },
  { href: "/customers", label: "Customers", icon: "◉", permissions: ["customers:read"], phase: 1, description: "Customer accounts, contacts and billing details." },
  { href: "/job-sites", label: "Job Sites", icon: "⌂", permissions: ["jobsites:read"], phase: 1, description: "Service locations for each customer." },
  { href: "/quotes", label: "Quotes", icon: "✎", permissions: ["quotes:read"], phase: 4, description: "Estimates and proposals." },
  { href: "/invoices", label: "Invoices", icon: "$", permissions: ["invoices:read"], phase: 4, description: "Billing, payments and credit notes." },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "⇲", permissions: ["purchaseorders:read"], phase: 3, description: "Orders to suppliers and receiving." },
  { href: "/inventory", label: "Inventory", icon: "▤", permissions: ["inventory:read"], phase: 3, description: "Parts and stock in the warehouse and trucks." },
  { href: "/equipment", label: "Equipment", icon: "⚙", permissions: ["equipment:read"], phase: 5, description: "Customer equipment at job sites and its service history." },
  { href: "/service-agreements", label: "Service Agreements", icon: "↻", permissions: ["agreements:read"], phase: 5, description: "Recurring maintenance contracts." },
  { href: "/timesheets", label: "Timesheets", icon: "⏱", permissions: ["timesheets:read_own", "timesheets:read_all"], phase: 2, description: "Electricians enter their time on their phone; office reviews and approves. No more paper timesheets." },
  { href: "/employees", label: "Employees", icon: "☺", permissions: ["employees:read"], phase: 1, description: "Electricians, apprentices and office staff." },
  { href: "/vendors", label: "Vendors", icon: "⛟", permissions: ["vendors:read"], phase: 1, description: "Suppliers and subcontractors." },
  { href: "/reports", label: "Reports", icon: "▥", permissions: ["reports:operational", "reports:financial"], phase: 6, description: "Operational and financial reports." },
  { href: "/settings", label: "Settings", icon: "⚒", permissions: ["settings:manage"], phase: 1, description: "Lookup tables, tax levels, company info and users." },
];

export function visibleNavItems(role: Role | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => canAny(role, item.permissions));
}

export function navItemFor(href: string): NavItem {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return item;
}

export interface NewMenuItem {
  type: string;
  label: string;
  permission: Permission;
}

export const NEW_MENU_ITEMS: NewMenuItem[] = [
  { type: "work-order", label: "Work order", permission: "workorders:write" },
  { type: "quote", label: "Quote", permission: "quotes:write" },
  { type: "invoice", label: "Invoice", permission: "invoices:write" },
  { type: "customer", label: "Customer", permission: "customers:write" },
  { type: "job-site", label: "Job site", permission: "jobsites:write" },
  { type: "purchase-order", label: "Purchase order", permission: "purchaseorders:write" },
];
