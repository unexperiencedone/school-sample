import { z } from "zod";
import { formatDate } from "@/lib/dates";

/**
 * Report filters live in the URL: `?year=2026-27&from=2026-06-01&to=2026-09-30`.
 * `year` names an academic year; `from`/`to` are IST calendar days that only ever narrow it.
 */

const isCalendarDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD")
  .refine(isCalendarDay, "Not a real calendar date");

/** A blank query value (`?from=`) means "not set". */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const reportFilterSchema = z
  .object({
    year: optional(z.string().trim().min(1).max(20)),
    from: optional(dayString),
    to: optional(dayString),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "The start date must not be after the end date",
    path: ["to"],
  });

export type ReportFilter = { year?: string; from?: string; to?: string };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Page-side parsing: a hand-edited URL never errors, bad parts are simply ignored (and a reversed range is swapped). */
export function lenientFilter(raw: RawParams): ReportFilter {
  const year = z.string().trim().min(1).max(20).safeParse(first(raw.year));
  const from = dayString.safeParse(first(raw.from));
  const to = dayString.safeParse(first(raw.to));
  let [a, b] = [from.success ? from.data : undefined, to.success ? to.data : undefined];
  if (a && b && a > b) [a, b] = [b, a];
  return {
    ...(year.success ? { year: year.data } : {}),
    ...(a ? { from: a } : {}),
    ...(b ? { to: b } : {}),
  };
}

export type YearRef = { id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean };

const DAY_MS = 86_400_000;

/** `yyyy-MM-dd` plus `n` days (calendar arithmetic, no time zone involved). */
export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** The instant an IST calendar day begins. */
export const istDayInstant = (day: string) => new Date(`${day}T00:00:00+05:30`);
/** Date-only columns (due dates, year boundaries) are stored as UTC midnight of the IST calendar day. */
const utcMidnight = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export type ReportWindow = {
  year: YearRef;
  /** Inclusive IST days actually covered: the year, narrowed by the typed range. */
  fromDay: string;
  toDay: string;
  empty: boolean;
  /** Instants `[start, end)` for timestamp columns (receipts, enquiries). */
  start: Date;
  end: Date;
  /** UTC midnights `[startDate, endDate)` for date-only columns (instalment due dates). */
  startDate: Date;
  endDate: Date;
  /** The range exactly as typed, or null when none was. */
  range: { from: string | null; to: string | null };
  /** The typed range as bounds on a date-only column, or undefined when none was. */
  rangeDateOnly: { gte?: Date; lt?: Date } | undefined;
  label: string;
};

/** Picks the academic year (named, else current, else latest) and intersects it with the typed range. */
export function resolveWindow(filter: ReportFilter, years: YearRef[]): ReportWindow {
  const year =
    years.find((y) => y.name === filter.year) ??
    years.find((y) => y.isCurrent) ??
    [...years].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
  if (!year) throw new Error("No academic year is configured");
  const yearFrom = dayOf(year.startDate);
  const yearTo = dayOf(year.endDate);
  const fromDay = filter.from && filter.from > yearFrom ? filter.from : yearFrom;
  const toDay = filter.to && filter.to < yearTo ? filter.to : yearTo;
  const empty = toDay < fromDay;
  const start = istDayInstant(fromDay);
  const end = empty ? start : istDayInstant(addDays(toDay, 1));
  const range = { from: filter.from ?? null, to: filter.to ?? null };
  const span = `${formatDate(utcMidnight(fromDay))} – ${formatDate(utcMidnight(toDay))}`;
  return {
    year,
    fromDay,
    toDay,
    empty,
    start,
    end,
    startDate: utcMidnight(fromDay),
    endDate: empty ? utcMidnight(fromDay) : utcMidnight(addDays(toDay, 1)),
    range,
    rangeDateOnly:
      range.from || range.to
        ? {
            ...(range.from ? { gte: utcMidnight(range.from) } : {}),
            ...(range.to ? { lt: utcMidnight(addDays(range.to, 1)) } : {}),
          }
        : undefined,
    label: `${year.name} · ${span}`,
  };
}

export type MonthWindow = {
  key: string; // "2026-04"
  label: string; // "Apr"
  longLabel: string; // "April 2026"
  /** The IST month clipped to the window, as instants `[start, end)`. */
  start: Date;
  end: Date;
};

const nextMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * One bucket per IST calendar month touched by the window. Month edges are IST midnights expressed as instants,
 * so a receipt at 23:50 IST on 30 April and one at 00:10 IST on 1 May (18:20 and 18:40 UTC) fall in different
 * buckets with no time-zone arithmetic in the query.
 */
export function monthWindows(window: Pick<ReportWindow, "fromDay" | "toDay" | "start" | "end" | "empty">) {
  if (window.empty) return [];
  const out: MonthWindow[] = [];
  const last = window.toDay.slice(0, 7);
  for (let key = window.fromDay.slice(0, 7); key <= last; key = nextMonthKey(key)) {
    const monthStart = istDayInstant(`${key}-01`);
    const monthEnd = istDayInstant(`${nextMonthKey(key)}-01`);
    out.push({
      key,
      label: formatDate(monthStart, "MMM"),
      longLabel: formatDate(monthStart, "MMMM yyyy"),
      start: monthStart > window.start ? monthStart : window.start,
      end: monthEnd < window.end ? monthEnd : window.end,
    });
  }
  return out;
}
