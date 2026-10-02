import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/crm/page-header";
import { StatTile } from "@/components/charts/stat-tile";
import { REPORT_META } from "@/lib/reports/catalog";
import { exportHref } from "@/lib/reports/links";
import type { ReportResult } from "@/lib/services/reports";
import { ReportFilters } from "./report-filters";

const exportButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-4 text-sm font-medium text-fg hover:bg-sunken focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** What every report page shares: header with export buttons, filters, headline tiles and the footnotes. */
export function ReportShell({
  result,
  canExport,
  related,
  children,
}: {
  result: ReportResult;
  canExport: boolean;
  /** Links to the related working screens, already filtered to what the viewer may open. */
  related?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Link
        href="/admin/reports"
        className="mb-3 inline-flex min-h-8 items-center gap-1 text-sm text-muted hover:text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> All reports
      </Link>
      <PageHeader
        title={result.title}
        description={result.description}
        actions={
          <>
            {related}
            {canExport && (
              <>
                <a href={exportHref(result.slug, result.filter, "csv")} className={exportButton}>
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
                <a href={exportHref(result.slug, result.filter, "xlsx")} className={exportButton}>
                  <Download className="size-4" aria-hidden /> Export Excel
                </a>
              </>
            )}
          </>
        }
      />
      <ReportFilters
        years={result.years}
        year={result.filter.year}
        from={result.filter.from}
        to={result.filter.to}
        showRange={REPORT_META[result.slug].dateRange}
      />
      <p className="mb-4 text-sm text-muted">
        Showing <span className="font-medium text-fg">{result.period}</span>
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {result.kpis.map((k) => (
          <StatTile key={k.label} kpi={{ key: k.label, ...k }} />
        ))}
      </div>
      <div className="grid min-w-0 gap-5">{children}</div>
      <div className="mt-6 max-w-3xl text-xs text-muted">
        <ul className="list-disc space-y-1 pl-4">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export const relatedLink =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-primary underline decoration-accent decoration-2 underline-offset-4 hover:decoration-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";
