import type { ReportTable } from "@/lib/reports/table";
import type { ReportResult } from "@/lib/services/reports";

/** A table of the report by id; ids are fixed in the service, so a miss is a programming error. */
export function tableOf(result: ReportResult, id: string): ReportTable {
  const table = result.tables.find((t) => t.id === id);
  if (!table) throw new Error(`Report "${result.slug}" has no table "${id}"`);
  return table;
}
