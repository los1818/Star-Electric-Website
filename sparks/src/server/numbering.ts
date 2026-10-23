import "server-only";
import type { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "@/lib/numbering";

/**
 * Next document number for a sequence (WORK_ORDER, CUSTOMER, ...). The increment is a single
 * UPDATE, so concurrent callers never get the same number; call it inside the transaction that
 * creates the record so a failed create doesn't burn a number.
 */
export async function nextNumber(tx: Prisma.TransactionClient, code: string): Promise<string> {
  const seq = await tx.sequence.update({ where: { code }, data: { nextValue: { increment: 1 } } });
  return formatDocumentNumber(seq.prefix, seq.nextValue - 1, seq.padding);
}
