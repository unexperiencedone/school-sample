import Link from "next/link";
import { can } from "@/lib/rbac";
import { countBars } from "@/lib/reports/chart-data";
import { BarList } from "@/components/charts/bar-list";
import { ReportShell, relatedLink } from "../_components/report-shell";
import { ReportChartCard } from "../_components/report-cards";
import { loadReport, NoAcademicYear } from "../_components/report-access";
import { tableOf } from "../_components/tables";

export const metadata = { title: "Lead sources" };
export const dynamic = "force-dynamic";

/** Campaign bars show the biggest few; the table underneath has them all. */
const CAMPAIGN_BARS = 12;

export default async function SourcesReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, result } = await loadReport("sources", searchParams);
  if (!result) return <NoAcademicYear user={user} slug="sources" />;
  const canExport = can(user.role, "reports:export");
  const placement = tableOf(result, "by-placement");
  const campaign = tableOf(result, "by-campaign");
  const card = { result, canExport, className: "min-w-0" };
  const extras = ["applied", "admitted", "toAdmission"];
  return (
    <ReportShell
      result={result}
      canExport={canExport}
      related={
        can(user.role, "leads:read") ? (
          <Link href="/admin/leads/sources" className={relatedLink}>
            Simple view on Leads
          </Link>
        ) : undefined
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <ReportChartCard
          {...card}
          table={placement}
          chart={
            <BarList
              ariaLabel="Enquiries by website placement"
              rows={countBars(placement, { label: "placement", value: "enquiries", extras })}
            />
          }
        />
        <ReportChartCard
          {...card}
          table={campaign}
          chart={
            <BarList
              ariaLabel="Enquiries by UTM source and campaign"
              rows={countBars(
                { ...campaign, rows: campaign.rows.slice(0, CAMPAIGN_BARS) },
                { label: ["utmSource", "utmCampaign"], value: "enquiries", extras },
                (parts) => parts.join(" / "),
              )}
            />
          }
        />
      </div>
    </ReportShell>
  );
}
