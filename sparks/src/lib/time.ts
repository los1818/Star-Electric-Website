// Star Electric works in Regina time. Saskatchewan stays on Central Standard Time all year
// (UTC−6, no daylight saving), so a fixed offset is exact.

export const TIME_ZONE = "America/Regina";
const OFFSET_HOURS = -6;

/** Regina calendar date (y, m 0-based, d) for an instant. */
export function reginaDate(instant: Date): { year: number; month: number; day: number } {
  const shifted = new Date(instant.getTime() + OFFSET_HOURS * 3_600_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** The instant of a Regina wall-clock time. */
export function reginaTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour - OFFSET_HOURS, minute));
}

/** [start, end) of the Regina calendar day containing `instant`, offset by `days`. */
export function reginaDayRange(instant: Date, days = 0): { start: Date; end: Date } {
  const { year, month, day } = reginaDate(instant);
  return { start: reginaTime(year, month, day + days), end: reginaTime(year, month, day + days + 1) };
}

/** "2026-10-24T08:30" (an <input type="datetime-local"> value, read as Regina time) → instant. */
export function parseReginaDateTimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return reginaTime(y, mo - 1, d, h, mi);
}

/** Instant → "2026-10-24T08:30" in Regina time, for datetime-local inputs. */
export function toReginaDateTimeLocal(instant: Date): string {
  const shifted = new Date(instant.getTime() + OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** "2026-10-24" (an <input type="date"> value) → UTC midnight Date for @db.Date columns. */
export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value.trim() ? null : d;
}

/** Today's Regina date as "YYYY-MM-DD". */
export function reginaToday(): string {
  const { year, month, day } = reginaDate(new Date());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-CA", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}
