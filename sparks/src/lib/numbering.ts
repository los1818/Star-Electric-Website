/** ("WO-", 42, 6) → "WO-000042" */
export function formatDocumentNumber(prefix: string, value: number, padding: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Invalid sequence value ${value}`);
  return `${prefix}${String(value).padStart(padding, "0")}`;
}
