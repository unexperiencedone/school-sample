import { allRows, csvHeader, csvNumber, type ReportCell, type ReportColumn, type ReportTable } from "./table";

/**
 * Text that a spreadsheet could read as a formula (= + - @ or a leading tab/CR) is defused with a leading
 * apostrophe, the same rule as `toCsv` in src/lib/crm/csv.ts. Campaign names come from URLs, so this is not
 * theoretical.
 */
export function defuseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * One CSV field. Numbers are real numbers, not text, so they skip the formula guard: a legitimate "-3"
 * (a class three seats over capacity) must stay a number rather than become "'-3".
 */
export function csvField(column: ReportColumn, cell: ReportCell): string {
  if (cell === null) return "";
  const text = typeof cell === "number" ? csvNumber(column, cell) : defuseFormula(cell);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV of one table: a header row (units in the labels), the rows, then the totals row if any. */
export function reportCsv(table: ReportTable): string {
  const header = table.columns.map((c) => csvField({ ...c, kind: "text" }, csvHeader(c)));
  const body = allRows(table).map((row) => table.columns.map((c, i) => csvField(c, row[i] ?? null)));
  return [header, ...body].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
