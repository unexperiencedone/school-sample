import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX } from "lucide-react";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/ui/states";
import { requireStaff, type CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { REPORT_META, type ReportSlug } from "@/lib/reports/catalog";
import { lenientFilter } from "@/lib/reports/filter";
import { isNoAcademicYear, runReport, type ReportResult } from "@/lib/services/reports";
import { relatedLink } from "./report-shell";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * What every report page opens with: the viewer needs `reports:read` and the permission the report's data needs
 * (anyone else is sent back to the admin home, as for any other screen), then the report is run from the URL's
 * filter. `result` is null when the school has no academic year yet.
 */
export async function loadReport(
  slug: ReportSlug,
  searchParams: SearchParams,
): Promise<{ user: CurrentUser; result: ReportResult | null }> {
  const user = await requireStaff("reports:read");
  const needed = REPORT_META[slug].permission;
  if (!can(user.role, needed)) redirect(`/admin?denied=${encodeURIComponent(needed)}`);
  try {
    return { user, result: await runReport(user, slug, lenientFilter(await searchParams)) };
  } catch (e) {
    if (isNoAcademicYear(e)) return { user, result: null };
    throw e;
  }
}

/** The stand-in for a report, or the hub, when there is no academic year to report on. */
export function NoAcademicYear({ user, slug }: { user: CurrentUser; slug?: ReportSlug }) {
  const meta = slug ? REPORT_META[slug] : null;
  return (
    <>
      <PageHeader title={meta?.title ?? "Reports"} description={meta?.description} />
      <EmptyState
        icon={<CalendarX className="size-5" aria-hidden />}
        title="Set up an academic year first"
        action={
          can(user.role, "academics:read") ? (
            <Link href="/admin/academics/years" className={relatedLink}>
              Go to academic years
            </Link>
          ) : undefined
        }
      >
        Reports are measured within an academic year, and none has been created yet.
        {!can(user.role, "academics:read") && " Ask an administrator to add one."}
      </EmptyState>
    </>
  );
}
