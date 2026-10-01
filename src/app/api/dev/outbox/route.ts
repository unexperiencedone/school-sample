import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { devToolsEnabled } from "@/lib/dev-tools";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/outbox?to= — latest 50 outbox messages as JSON (dev/demo only), so you can click mock magic links.
 * Each item links to /api/dev/outbox/[id] which renders the email HTML.
 */
export async function GET(req: Request) {
  if (!devToolsEnabled())
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  const to = new URL(req.url).searchParams.get("to") ?? undefined;
  const rows = await db.outbox.findMany({
    where: to ? { to: { contains: to } } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      channel: true,
      to: true,
      template: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ data: rows.map((r) => ({ ...r, view: `/api/dev/outbox/${r.id}` })) });
}
