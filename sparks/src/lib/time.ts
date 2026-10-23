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

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-CA", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}
