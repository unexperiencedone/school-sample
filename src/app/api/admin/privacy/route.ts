import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { parseListParams } from "@/lib/crm/list";
import { listDataRequests } from "@/lib/services/privacy";

/** GET /api/admin/privacy?status=OPEN|DONE|REJECTED&kind=EXPORT|DELETION&size=&after=&before= — the privacy request queue. */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 25 });
    const { rows, next, prev, total } = await listDataRequests(
      user!,
      { status: sp.status, kind: sp.kind },
      p,
    );
    return NextResponse.json({ data: rows, page: { next, prev, total } });
  },
  { permission: "privacy:manage" },
);
