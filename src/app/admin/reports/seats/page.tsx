import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { lenientFilter } from "@/lib/reports/filter";
import { capacityRows } from "@/lib/reports/chart-data";
import { runReport } from "@/lib/services/reports";
import { CapacityBars } from "@/components/charts/capacity-bars";
import { Legend } from "@/components/charts/chart-card";
import { ReportShell } from "../_components/report-shell";
import { ReportChartCard } from "../_components/report-cards";
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
  const user = await requireStaff("reports:read");
  const result = await runReport(user, "seats", lenientFilter(await searchParams));
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
