// Asia/Tashkent is UTC+5 all year (no daylight saving), so a fixed offset is exact.

export const TASHKENT_OFFSET_MIN = 5 * 60;

/** "YYYY-MM-DD" of the given instant in Tashkent. */
export function tashkentDate(now: Date): string {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  return t.toISOString().slice(0, 10);
}

/** Minutes since Tashkent midnight for the given instant. */
export function tashkentMinutes(now: Date): number {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** The UTC instant of a Tashkent local date + minutes. */
export function tashkentInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - TASHKENT_OFFSET_MIN * 60_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD date. */
export function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s);
}

export function formatSlot(startMinute: number, endMinute: number): string {
  const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${f(startMinute)}–${f(endMinute)}`;
}
