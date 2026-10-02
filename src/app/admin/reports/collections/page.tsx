import { can } from "@/lib/rbac";
import { moneyBars, moneyColumns } from "@/lib/reports/chart-data";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import { ReportShell } from "../_components/report-shell";
import { ReportChartCard, ReportTableCard } from "../_components/report-cards";
import { loadReport, NoAcademicYear } from "../_components/report-access";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Fee collections" };
export const dynamic = "force-dynamic";

export default async function CollectionsReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, result } = await loadReport("collections", searchParams);
  if (!result) return <NoAcademicYear user={user} slug="collections" />;
  const canExport = can(user.role, "reports:export");
  const [month, klass, head, method] = ["by-month", "by-class", "by-head", "by-method"].map((id) =>
    tableOf(result, id),
  );
  const other = tableOf(result, "other-receipts");
  const card = { result, canExport, className: "min-w-0" };
  return (
    <ReportShell result={result} canExport={canExport}>
      <ReportChartCard
        {...card}
        table={month!}
        chart={
          <ColumnChart
            data={moneyColumns(
              month!,
              {
                label: "month",
                value: "net",
                detailCount: { key: "receipts", one: "receipt", many: "receipts" },
              },
              (l) => l.slice(0, 3),
            )}
            valueKind="inr"
            ariaLabel="Net fees collected by month"
          />
        }
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <ReportChartCard
          {...card}
          table={klass!}
          chart={
            <BarList
              ariaLabel="Fees collected by class"
              rows={moneyBars(klass!, { label: "class", value: "collected", extras: ["billed", "rate"] })}
            />
          }
        />
        <ReportChartCard
          {...card}
          table={head!}
          chart={
            <BarList
              ariaLabel="Fees collected by fee head"
              rows={moneyBars(head!, { label: "head", value: "collected", extras: ["share"] })}
            />
          }
        />
      </div>
      <ReportChartCard
        {...card}
        table={method!}
        chart={
          <BarList
            ariaLabel="Fees collected by payment method"
            rows={moneyBars(method!, { label: "method", value: "net", extras: ["collected", "refunded"] })}
          />
        }
      />
      <ReportTableCard {...card} table={other} />
    </ReportShell>
  );
}
