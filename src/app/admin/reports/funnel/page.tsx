import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { lenientFilter } from "@/lib/reports/filter";
import { daysBars, funnelBars } from "@/lib/reports/chart-data";
import { runReport } from "@/lib/services/reports";
import { BarList } from "@/components/charts/bar-list";
import { ReportShell } from "../_components/report-shell";
import { ReportChartCard } from "../_components/report-cards";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Admissions funnel" };
export const dynamic = "force-dynamic";

export default async function FunnelReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff("reports:read");
  const result = await runReport(user, "funnel", lenientFilter(await searchParams));
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
