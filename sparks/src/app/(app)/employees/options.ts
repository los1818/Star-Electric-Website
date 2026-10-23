import "server-only";
import { db } from "@/lib/db";
import { can, type Role } from "@/lib/auth/permissions";
import { formatCents } from "@/lib/money";
import { lookupOptions, type Option } from "@/server/options";

/** Labour rate options; the sell rate is shown only to roles that may see prices. */
export async function laborRateOptions(role: Role, currentId?: string | null): Promise<Option[]> {
  const rates = await db.laborRate.findMany({ where: { OR: [{ active: true }, ...(currentId ? [{ id: currentId }] : [])] }, orderBy: { sortOrder: "asc" } });
  return rates.map((r) => ({ value: r.id, label: can(role, "pricing:view") ? `${r.label} (${formatCents(r.sellCents)}/h)` : r.label }));
}

export async function employeeFormOptions(role: Role, current?: { tradeId: string | null; laborRateId: string | null }) {
  const [trades, laborRates] = await Promise.all([lookupOptions("trades", current?.tradeId), laborRateOptions(role, current?.laborRateId)]);
  return { trades, laborRates };
}
