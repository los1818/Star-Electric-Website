export const PAGE_SIZE = 25;

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Page number from ?page=, clamped to >= 1. */
export function pageParams(sp: SearchParams, pageSize = PAGE_SIZE) {
  const page = Math.max(1, Number.parseInt(param(sp, "page"), 10) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** "active" (default) | "inactive" | "all" → Prisma where fragment. */
export function activeFilter(sp: SearchParams): { active?: boolean } {
  const v = param(sp, "status");
  if (v === "all") return {};
  return { active: v !== "inactive" };
}

export const STATUS_OPTIONS = [
  { value: "", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];
