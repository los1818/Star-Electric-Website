import "server-only";
import type { Prisma } from "@prisma/client";
import { formatJobNumber, jobSequenceCode } from "@/lib/job-numbers";
import { formatDocumentNumber } from "@/lib/numbering";
import { reginaDate } from "@/lib/time";

/**
 * Next document number for a sequence (WORK_ORDER, CUSTOMER, ...). The increment is a single
 * UPDATE, so concurrent callers never get the same number; call it inside the transaction that
 * creates the record so a failed create doesn't burn a number.
 */
export async function nextNumber(tx: Prisma.TransactionClient, code: string): Promise<string> {
  const seq = await tx.sequence.update({ where: { code }, data: { nextValue: { increment: 1 } } });
  return formatDocumentNumber(seq.prefix, seq.nextValue - 1, seq.padding);
}

/**
 * Next job number (2026014) for a new project or stand-alone work order. One list per Regina
 * calendar year, created the first time it's needed.
 */
export async function nextJobNumber(tx: Prisma.TransactionClient, now = new Date()): Promise<string> {
  const year = reginaDate(now).year;
  const code = jobSequenceCode(year);
  await tx.sequence.createMany({ data: [{ code, prefix: "", nextValue: 1, padding: 3 }], skipDuplicates: true });
  const seq = await tx.sequence.update({ where: { code }, data: { nextValue: { increment: 1 } } });
  return formatJobNumber(year, seq.nextValue - 1);
}
