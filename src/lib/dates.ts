import { differenceInCalendarDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";

/**
 * All school-facing dates are shown in IST, whatever the server's or visitor's timezone.
 * Timestamps are stored in UTC; date-only values (due dates, dates of birth) are stored as UTC midnight,
 * which is the same calendar day in IST (+05:30).
 */
export const SCHOOL_TZ = "Asia/Kolkata";

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

export function formatDate(d: Date | string, pattern = "d MMM yyyy"): string {
  return format(new TZDate(toDate(d).getTime(), SCHOOL_TZ), pattern);
}

export function formatDateTime(d: Date | string): string {
  return formatDate(d, "d MMM yyyy, h:mm a");
}

export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from);
}

/** Indian financial year label for a date: April–March. 15 May 2026 → "2026-27"; 10 Feb 2027 → "2026-27". */
export function financialYearOf(d: Date): string {
  const ist = new TZDate(d.getTime(), SCHOOL_TZ);
  const y = ist.getFullYear();
  const startYear = ist.getMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Age in completed years on a reference date. */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function istParts(d: Date) {
  const t = new TZDate(d.getTime(), SCHOOL_TZ);
  return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate(), dow: t.getDay() };
}

/** The instant at which the IST calendar day containing `d` (shifted by `offsetDays`) begins. */
export function istDayStart(d: Date, offsetDays = 0): Date {
  const p = istParts(d);
  return new Date(new TZDate(p.y, p.m, p.d + offsetDays, SCHOOL_TZ).getTime());
}

/** The IST calendar date of `d` as UTC midnight — the storage convention for date-only columns such as due dates. */
export function istDateOnly(d: Date, offsetDays = 0): Date {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m, p.d + offsetDays));
}

/** The instant at which the IST month containing `d` (shifted by `offsetMonths`) begins. */
export function istMonthStart(d: Date, offsetMonths = 0): Date {
  const p = istParts(d);
  return new Date(new TZDate(p.y, p.m + offsetMonths, 1, SCHOOL_TZ).getTime());
}

/** ISO weekday in IST: 1 = Monday … 7 = Sunday. */
export function istWeekday(d: Date): number {
  const dow = istParts(d).dow;
  return dow === 0 ? 7 : dow;
}
