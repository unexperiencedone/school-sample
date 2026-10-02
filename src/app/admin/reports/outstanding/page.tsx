import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { lenientFilter } from "@/lib/reports/filter";
import { moneyBars, moneyColumns } from "@/lib/reports/chart-data";
import { runReport } from "@/lib/services/reports";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import { ReportShell, relatedLink } from "../_components/report-shell";
import { ReportChartCard, ReportTableCard } from "../_components/report-cards";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Outstanding fees" };
export const dynamic = "force-dynamic";

export default async function OutstandingReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff("reports:read");
  const result = await runReport(user, "outstanding", lenientFilter(await searchParams));
  const canExport = can(user.role, "reports:export");
  const ageing = tableOf(result, "ageing");
  const klass = tableOf(result, "by-class");
  const families = tableOf(result, "top-families");
  const card = { result, canExport, className: "min-w-0" };
  return (
    <ReportShell
      result={result}
      canExport={canExport}
      related={
        can(user.role, "fees:read") ? (
          <Link href="/admin/fees/dues" className={relatedLink}>
            Open the Dues screen
          </Link>
        ) : undefined
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <ReportChartCard
          {...card}
          table={ageing}
          chart={
            <ColumnChart
              data={moneyColumns(ageing, {
                label: "bucket",
                value: "outstanding",
                detailCount: { key: "instalments", one: "instalment", many: "instalments" },
              })}
              valueKind="inr"
              ariaLabel="Outstanding fees by age"
            />
          }
        />
        <ReportChartCard
          {...card}
          table={klass}
          chart={
            <BarList
              ariaLabel="Outstanding fees by class"
              rows={moneyBars(klass, {
                label: "class",
                value: "outstanding",
                extras: ["principal", "lateFee", "pupils"],
              })}
            />
          }
        />
      </div>
      <ReportTableCard {...card} table={families} />
    </ReportShell>
  );
}
