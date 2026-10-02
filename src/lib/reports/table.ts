import { formatINR, paiseToRupeeString, assertPaise, type Paise } from "@/lib/money";

/**
 * The one shape every report is built from. The page renders it, the CSV export serialises it and the XLSX
 * export types its cells from it, so the three can never disagree.
 *
 * Cell values by column kind:
 * - `text`    string
 * - `count`   whole number
 * - `inr`     integer paise (never rupees as floats)
 * - `percent` integer basis points (10_000 = 100%)
 * - `days`    number of days, fractional allowed
 * `null` is "no value" (an empty cell, shown as an em dash).
 */
export type ColumnKind = "text" | "count" | "inr" | "percent" | "days";
export type ReportCell = string | number | null;
export type ReportColumn = { key: string; label: string; kind: ColumnKind };

export type ReportTable = {
  id: string;
  title: string;
  caption?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** A closing row aligned to `columns`, shown bold. */
  totals?: ReportCell[];
};

export const col = (key: string, label: string, kind: ColumnKind = "text"): ReportColumn => ({
  key,
  label,
  kind,
});

/** Share of `part` in `whole` in basis points, rounded half up; `null` when there is nothing to divide by. */
export function ratioBp(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part * 10_000) / whole);
}

/**
 * Paise → rupees as a real number for a spreadsheet cell. Going through the exact decimal string means
 * ₹1,234.56 becomes the double nearest to 1234.56, never an accumulated float error.
 */
export function paiseToRupees(paise: Paise): number {
  return Number(paiseToRupeeString(assertPaise(paise)));
}

const trimZero = (s: string) => s.replace(/\.0$/, "");

/** Basis points → "12.5%" (whole numbers lose the decimal). */
export function formatBp(bp: number): string {
  return `${trimZero((bp / 100).toFixed(1))}%`;
}

/** Display text for one cell. Money is exact (no compacting): tables are where the full figure lives. */
export function formatCell(column: ReportColumn, cell: ReportCell): string {
  if (cell === null) return "—";
  if (typeof cell === "string") return cell;
  switch (column.kind) {
    case "inr":
      return formatINR(cell);
    case "percent":
      return formatBp(cell);
    case "days":
      return trimZero(cell.toFixed(1));
    case "count":
      return cell.toLocaleString("en-IN");
    case "text":
      return String(cell);
  }
}

const CSV_UNIT: Partial<Record<ColumnKind, string>> = { inr: " (INR)", percent: " (%)", days: " (days)" };

/** CSV has no number formats, so the unit travels in the header: "Net collected (INR)". */
export function csvHeader(column: ReportColumn): string {
  return `${column.label}${CSV_UNIT[column.kind] ?? ""}`;
}

/** Plain-number text for a CSV cell: rupees to two places, percentages to one, days to one. */
export function csvNumber(column: ReportColumn, value: number): string {
  switch (column.kind) {
    case "inr":
      return paiseToRupeeString(value);
    case "percent":
      return (value / 100).toFixed(1);
    case "days":
      return value.toFixed(1);
    default:
      return String(value);
  }
}

/** Every body row of a table, followed by its totals row when there is one. */
export function allRows(table: ReportTable): ReportCell[][] {
  return table.totals ? [...table.rows, table.totals] : table.rows;
}

export type ReportKpi = { label: string; value: string; sub?: string; status?: "critical" };
