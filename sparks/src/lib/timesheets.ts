// Timesheet helpers: hours parsing and Regina weeks (Monday–Sunday). Pure, so forms and tests share them.

export const MAX_HOURS_PER_DAY = 2400; // hundredths

/** "7.5" | "7:30" | "8" → hundredths of an hour (750, 750, 800). Throws on anything else. */
export function parseHoursHundredths(text: string): number {
  const t = text.trim();
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (clock) return Number(clock[1]) * 100 + Math.round((Number(clock[2]) * 100) / 60);
  const dec = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(t);
  if (dec) return Number(dec[1]) * 100 + Number((dec[2] ?? "").padEnd(2, "0"));
  throw new RangeError(`Invalid hours: ${text}`);
}

/** "07:00" → "15:30" = 850 hundredths. End before start means past midnight (night shift). */
export function hoursBetween(start: string, end: string): number {
  const toMin = (s: string) => {
    const m = /^(\d{2}):(\d{2})$/.exec(s);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new RangeError(`Invalid time: ${s}`);
    return Number(m[1]) * 60 + Number(m[2]);
  };
  let minutes = toMin(end) - toMin(start);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes * 100) / 60);
}

/** Monday of the week containing a "YYYY-MM-DD" date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The seven "YYYY-MM-DD" days of the week starting `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

export type EntryState = "draft" | "submitted" | "approved";

export function entryState(e: { submittedAt: Date | null; approvedAt: Date | null }): EntryState {
  return e.approvedAt ? "approved" : e.submittedAt ? "submitted" : "draft";
}
