import { z } from "zod";
import { ApiError, route } from "@/lib/api";
import { csvResponse } from "@/lib/crm/csv";
import { isReportSlug } from "@/lib/reports/catalog";
import { reportFilterSchema } from "@/lib/reports/filter";
import { exportReport } from "@/lib/services/reports";

export const runtime = "nodejs";

const exportQuery = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  /** CSV carries one table; XLSX always carries all of them. */
  table: z.string().trim().min(1).max(40).optional(),
});

/**
 * GET /api/admin/reports/[report]?format=csv|xlsx&year=2026-27&from=YYYY-MM-DD&to=YYYY-MM-DD&table=<id>
 * The same tables as the report page. Needs reports:export; every download is audit-logged with its filter.
 */
export const GET = route<{ report: string }>(
  async (req, { params, user }) => {
    if (!isReportSlug(params.report)) throw new ApiError(404, "NOT_FOUND", "No such report");
    const query = Object.fromEntries(new URL(req.url).searchParams);
    const { format, table } = exportQuery.parse(query);
    const filter = reportFilterSchema.parse(query);
    const file = await exportReport(user!, params.report, filter, format, table);
    if (file.format === "csv") return csvResponse(file.filename, file.body);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { permission: "reports:export" },
);
