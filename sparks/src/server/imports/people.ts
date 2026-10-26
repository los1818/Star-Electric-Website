import type { Prisma, PrismaClient } from "@prisma/client";
import { formatDocumentNumber } from "@/lib/numbering";
import type { PersonRow } from "@/lib/imports/people";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Add a person (matched on email). New people get the role from the list; people who already exist
 * keep their role and active/inactive state (change those under Settings → Users), so an import can
 * never demote or lock out an administrator or bring back someone who was switched off. Electricians
 * get linked to their employee record: an existing unlinked one with the same email, else a new one.
 * Used by Settings → Users and scripts/import-people.
 */
export async function upsertPerson(tx: Db, p: PersonRow): Promise<{ outcome: "created" | "existing"; userId: string }> {
  const existing = await tx.user.findUnique({ where: { email: p.email }, select: { id: true, name: true, employeeId: true, role: true } });
  const user = existing
    ? existing.name
      ? existing
      : await tx.user.update({ where: { id: existing.id }, data: { name: p.name }, select: { id: true, name: true, employeeId: true, role: true } })
    : await tx.user.create({ data: { email: p.email, name: p.name, role: p.role, active: true }, select: { id: true, name: true, employeeId: true, role: true } });

  // Only actual technicians get linked to an employee (an existing admin listed as "Basic User" doesn't).
  if (p.electrician && user.role === "TECHNICIAN" && !user.employeeId) {
    const legacyRef = `people:${p.email}`;
    const employee =
      (await tx.employee.findFirst({ where: { OR: [{ legacyRef }, { email: { equals: p.email, mode: "insensitive" } }], user: null }, orderBy: { createdAt: "asc" } })) ??
      (await createEmployee(tx, p, legacyRef));
    await tx.user.update({ where: { id: user.id }, data: { employeeId: employee.id } });
  }
  return { outcome: existing ? "existing" : "created", userId: user.id };
}

async function createEmployee(tx: Db, p: PersonRow, legacyRef: string) {
  const [trade, rate, seq] = await Promise.all([
    tx.trade.findUnique({ where: { code: "JOURNEYPERSON" } }),
    tx.laborRate.findUnique({ where: { code: "JOURNEYPERSON" } }),
    tx.sequence.update({ where: { code: "EMPLOYEE" }, data: { nextValue: { increment: 1 } } }),
  ]);
  return tx.employee.create({
    data: {
      legacyRef,
      employeeNumber: formatDocumentNumber(seq.prefix, seq.nextValue - 1, seq.padding),
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      tradeId: trade?.id,
      laborRateId: rate?.id,
    },
  });
}
