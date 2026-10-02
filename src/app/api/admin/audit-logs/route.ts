import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { parseListParams } from "@/lib/crm/list";
import { listAuditLogs } from "@/lib/services/audit-viewer";

/**
 * GET /api/admin/audit-logs?q=&entity=&actor=&from=&to=&size=&after=&before=
 * Cursor-paginated, newest first. `from`/`to` are IST dates (YYYY-MM-DD). Rows carry a redacted list of changed
 * fields, never the raw before/after JSON.
 */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 50 });
    const { rows, next, prev, total } = await listAuditLogs(
      user!,
      { q: sp.q, entity: sp.entity, actor: sp.actor, from: sp.from, to: sp.to },
      p,
    );
    return NextResponse.json({ data: rows, page: { next, prev, total } });
  },
  { permission: "audit:read" },
);
