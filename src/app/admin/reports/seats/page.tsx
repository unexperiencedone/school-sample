import { can } from "@/lib/rbac";
import { capacityRows } from "@/lib/reports/chart-data";
import { CapacityBars } from "@/components/charts/capacity-bars";
import { Legend } from "@/components/charts/chart-card";
import { ReportShell } from "../_components/report-shell";
import { ReportChartCard } from "../_components/report-cards";
import { loadReport, NoAcademicYear } from "../_components/report-access";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Seat utilisation" };
export const dynamic = "force-dynamic";

const overCapacity = (key: string, cell: string | number | null) =>
  (key === "status" && typeof cell === "string" && cell.startsWith("Over")) ||
  (key === "left" && typeof cell === "number" && cell < 0);

export default async function SeatsReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, result } = await loadReport("seats", searchParams);
  if (!result) return <NoAcademicYear user={user} slug="seats" />;
  const canExport = can(user.role, "reports:export");
  const table = tableOf(result, "by-class");
  return (
    <ReportShell result={result} canExport={canExport}>
      <ReportChartCard
        result={result}
        canExport={canExport}
        table={table}
        flag={overCapacity}
        legend={
          <Legend
            items={[
              { label: "Enrolled", color: "var(--viz-1)" },
              { label: "Open offers", color: "var(--viz-2)" },
              { label: "Capacity (track and mark)", color: "var(--viz-track)", outline: true },
            ]}
          />
        }
        chart={<CapacityBars rows={capacityRows(table)} ariaLabel="Seats by class" />}
      />
    </ReportShell>
  );
}
