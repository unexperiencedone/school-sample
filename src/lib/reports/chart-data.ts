import type { BarListRow } from "@/components/charts/bar-list";
import type { CapacityRow } from "@/components/charts/capacity-bars";
import type { Column } from "@/components/charts/column-chart";
import { formatINR } from "@/lib/money";
import { formatBp, formatCell, type ReportCell, type ReportTable } from "./table";

/**
 * Chart inputs are read straight out of a report's tables, so a chart can never show a number its accessible
 * table does not.
 */

function at(table: ReportTable, key: string): number {
  const i = table.columns.findIndex((c) => c.key === key);
  if (i < 0) throw new Error(`Report table "${table.id}" has no column "${key}"`);
  return i;
}

const num = (cell: ReportCell | undefined): number => (typeof cell === "number" ? cell : 0);
const text = (cell: ReportCell | undefined): string => (typeof cell === "string" ? cell : "");

/** Columns for a money-over-time chart: one column per row of `table`, valued by `valueKey` (paise). */
export function moneyColumns(
  table: ReportTable,
  keys: { label: string; value: string; detailCount?: { key: string; one: string; many: string } },
  shortLabel: (label: string) => string = (l) => l,
): Column[] {
  const [l, v] = [at(table, keys.label), at(table, keys.value)];
  const c = keys.detailCount ? at(table, keys.detailCount.key) : -1;
  return table.rows.map((row) => {
    const label = text(row[l]);
    const paise = num(row[v]);
    const n = c >= 0 ? num(row[c]) : 0;
    const count =
      c >= 0
        ? ` · ${n.toLocaleString("en-IN")} ${n === 1 ? keys.detailCount!.one : keys.detailCount!.many}`
        : "";
    return {
      key: label,
      label: shortLabel(label),
      value: paise,
      display: formatINR(paise, { compact: true }),
      detail: `${label}${count} · ${formatINR(paise)}`,
    };
  });
}

/** Horizontal bars valued in paise, labelled from `labelKey`; the tooltip carries the exact figure and any extras. */
export function moneyBars(
  table: ReportTable,
  keys: { label: string; value: string; extras?: string[] },
): BarListRow[] {
  const [l, v] = [at(table, keys.label), at(table, keys.value)];
  const extras = (keys.extras ?? []).map((k) => ({ i: at(table, k), column: table.columns[at(table, k)]! }));
  return table.rows.map((row) => {
    const label = text(row[l]);
    const paise = num(row[v]);
    const more = extras
      .filter((e) => row[e.i] !== null && row[e.i] !== undefined)
      .map((e) => `${e.column.label} ${formatCell(e.column, row[e.i]!)}`);
    return {
      key: label,
      label,
      value: paise,
      display: formatINR(paise, { compact: true }),
      detail: [formatINR(paise), ...more].join(" · "),
    };
  });
}

/** Horizontal bars valued in whole numbers (enquiries, seats). */
export function countBars(
  table: ReportTable,
  keys: { label: string | string[]; value: string; extras?: string[] },
  labelOf: (parts: string[]) => string = (p) => p.join(" · "),
): BarListRow[] {
  const labelIdx = (Array.isArray(keys.label) ? keys.label : [keys.label]).map((k) => at(table, k));
  const v = at(table, keys.value);
  const extras = (keys.extras ?? []).map((k) => ({ i: at(table, k), column: table.columns[at(table, k)]! }));
  return table.rows.map((row, n) => {
    const label = labelOf(labelIdx.map((i) => text(row[i])));
    const count = num(row[v]);
    const more = extras
      .filter((e) => row[e.i] !== null && row[e.i] !== undefined)
      .map((e) => `${e.column.label} ${formatCell(e.column, row[e.i]!)}`);
    return {
      key: `${n}-${label}`,
      label,
      value: count,
      display: count.toLocaleString("en-IN"),
      detail: [`${count.toLocaleString("en-IN")} ${table.columns[v]!.label.toLowerCase()}`, ...more].join(
        " · ",
      ),
    };
  });
}

/** Funnel steps as bars, darker the further along (ordinal ramp), each with its step conversion. */
export function funnelBars(table: ReportTable): BarListRow[] {
  const [l, c, s, o] = [
    at(table, "step"),
    at(table, "count"),
    at(table, "stepRate"),
    at(table, "overallRate"),
  ];
  return table.rows.map((row, i) => {
    const label = text(row[l]);
    const count = num(row[c]);
    const step = row[s];
    const overall = row[o];
    const parts = [`${count.toLocaleString("en-IN")} ${label.toLowerCase()}`];
    if (typeof step === "number") parts.push(`${formatBp(step)} of the previous step`);
    if (typeof overall === "number" && i > 0) parts.push(`${formatBp(overall)} of all enquiries`);
    return {
      key: label,
      label,
      value: count,
      display:
        typeof step === "number"
          ? `${count.toLocaleString("en-IN")} · ${formatBp(step)}`
          : count.toLocaleString("en-IN"),
      detail: parts.join(" · "),
      color: `var(--viz-ord-${i + 1})`,
    };
  });
}

/** Median days per stage as bars; a stage with no completed transitions shows no bar and a dash. */
export function daysBars(table: ReportTable): BarListRow[] {
  const [l, m, n] = [at(table, "stage"), at(table, "median"), at(table, "measured")];
  return table.rows.map((row) => {
    const label = text(row[l]);
    const median = row[m];
    const measured = num(row[n]);
    return {
      key: label,
      label,
      value: typeof median === "number" ? median : 0,
      display: typeof median === "number" ? `${median} d` : "—",
      detail:
        typeof median === "number"
          ? `Median ${median} days across ${measured.toLocaleString("en-IN")} applications`
          : "No applications have completed this stage yet",
    };
  });
}

/** One capacity bar per class from the seats table. */
export function capacityRows(table: ReportTable): CapacityRow[] {
  const i = {
    label: at(table, "class"),
    capacity: at(table, "capacity"),
    enrolled: at(table, "enrolled"),
    offered: at(table, "offers"),
    waitlist: at(table, "waitlist"),
    left: at(table, "left"),
  };
  return table.rows.map((row) => ({
    key: text(row[i.label]),
    label: text(row[i.label]),
    capacity: num(row[i.capacity]),
    enrolled: num(row[i.enrolled]),
    offered: num(row[i.offered]),
    waitlist: num(row[i.waitlist]),
    left: num(row[i.left]),
  }));
}
