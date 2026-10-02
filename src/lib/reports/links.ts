import type { ReportSlug } from "./catalog";

type FilterEcho = { year: string; from: string | null; to: string | null };

/** The download URL for a report with the filter currently on screen. */
export function exportHref(
  slug: ReportSlug,
  filter: FilterEcho,
  format: "csv" | "xlsx",
  tableId?: string,
): string {
  const p = new URLSearchParams({ format, year: filter.year });
  if (filter.from) p.set("from", filter.from);
  if (filter.to) p.set("to", filter.to);
  if (tableId) p.set("table", tableId);
  return `/api/admin/reports/${slug}?${p.toString()}`;
}
