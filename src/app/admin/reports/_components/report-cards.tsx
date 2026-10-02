import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { exportHref } from "@/lib/reports/links";
import type { ReportTable } from "@/lib/reports/table";
import type { ReportResult } from "@/lib/services/reports";
import { NoData, ReportTableView } from "./report-table";

const csvLink =
  "inline-flex h-8 items-center gap-1 rounded-md border border-line px-2 text-xs font-medium text-muted hover:bg-sunken hover:text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A small per-table CSV download, for roles that may export. */
function TableCsvLink({ result, table }: { result: ReportResult; table: ReportTable }) {
  return (
    <a
      href={exportHref(result.slug, result.filter, "csv", table.id)}
      className={csvLink}
      aria-label={`Download ${table.title} as CSV`}
    >
      <Download className="size-3.5" aria-hidden /> CSV
    </a>
  );
}

/** A table with a chart above it and the Chart / Table toggle, titled and captioned from the table itself. */
export function ReportChartCard({
  result,
  table,
  chart,
  legend,
  canExport,
  className,
  flag,
}: {
  result: ReportResult;
  table: ReportTable;
  chart: ReactNode;
  legend?: ReactNode;
  canExport: boolean;
  className?: string;
  flag?: (columnKey: string, cell: string | number | null) => boolean;
}) {
  return (
    <ChartCard
      className={className}
      title={table.title}
      caption={table.caption}
      legend={legend}
      action={canExport ? <TableCsvLink result={result} table={table} /> : undefined}
      chart={table.rows.length ? chart : <NoData />}
      table={<ReportTableView table={table} flag={flag} />}
    />
  );
}

/** A detail table with no chart of its own. */
export function ReportTableCard({
  result,
  table,
  canExport,
  className,
}: {
  result: ReportResult;
  table: ReportTable;
  canExport: boolean;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`table-${table.id}`}
      className={`min-w-0 rounded-lg border border-line bg-elevated ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
        <div className="min-w-0">
          <h2 id={`table-${table.id}`} className="text-[0.95rem] font-semibold text-fg">
            {table.title}
          </h2>
          {table.caption && <p className="mt-0.5 text-xs text-muted">{table.caption}</p>}
        </div>
        {canExport && <TableCsvLink result={result} table={table} />}
      </div>
      <div className="px-5 pt-3 pb-4">
        <ReportTableView table={table} />
      </div>
    </section>
  );
}
