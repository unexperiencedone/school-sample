import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { parseListParams } from "@/lib/crm/list";
import { APPLICATION_SORTS, listApplications } from "@/lib/services/careers-admin";

/**
 * GET /api/admin/staff-applications?q=&status=&vacancy=&sort=&dir=&size=&after=&before=
 * Cursor-paginated, submitted applications only (drafts are never listed). Rows omit the application form itself;
 * fetch /api/admin/staff-applications/[id] for that.
 */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: APPLICATION_SORTS, defaultSort: "submittedAt" });
    const { rows, next, prev, total } = await listApplications(
      user!,
      { q: sp.q, status: sp.status, vacancyId: sp.vacancy },
      p,
    );
    return NextResponse.json({ data: rows, page: { next, prev, total } });
  },
  { permission: "careers:read" },
);
