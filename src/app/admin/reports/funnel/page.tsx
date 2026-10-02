import { can } from "@/lib/rbac";
import { daysBars, funnelBars } from "@/lib/reports/chart-data";
import { BarList } from "@/components/charts/bar-list";
import { ReportShell } from "../_components/report-shell";
import { ReportChartCard } from "../_components/report-cards";
import { loadReport, NoAcademicYear } from "../_components/report-access";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Admissions funnel" };
export const dynamic = "force-dynamic";

export default async function FunnelReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, result } = await loadReport("funnel", searchParams);
  if (!result) return <NoAcademicYear user={user} slug="funnel" />;
  const canExport = can(user.role, "reports:export");
  const funnel = tableOf(result, "funnel");
  const stages = tableOf(result, "time-in-stage");
  const card = { result, canExport, className: "min-w-0" };
  return (
    <ReportShell result={result} canExport={canExport}>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <ReportChartCard
          {...card}
          table={funnel}
          chart={<BarList ariaLabel="Admissions funnel" rows={funnelBars(funnel)} />}
        />
        <ReportChartCard
          {...card}
          table={stages}
          chart={<BarList ariaLabel="Median days in each stage" rows={daysBars(stages)} />}
        />
      </div>
    </ReportShell>
  );
}
