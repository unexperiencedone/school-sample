import { differenceInCalendarDays, format } from "date-fns";

/** All school-facing dates are shown in IST. Stored as UTC timestamps. */
export const SCHOOL_TZ = "Asia/Kolkata";

export function formatDate(d: Date | string, pattern = "d MMM yyyy"): string {
  return format(typeof d === "string" ? new Date(d) : d, pattern);
}

export function formatDateTime(d: Date | string): string {
  return format(typeof d === "string" ? new Date(d) : d, "d MMM yyyy, h:mm a");
}

export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from);
}

/** Indian financial year label for a date: April–March. 15 May 2026 → "2026-27"; 10 Feb 2027 → "2026-27". */
export function financialYearOf(d: Date): string {
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1;
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
