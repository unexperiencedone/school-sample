import { NextResponse } from "next/server";
import type { OutboxChannel, OutboxStatus } from "@prisma/client";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";

/** GET /api/admin/outbox?channel=&status=&template=&size=&after= — sent/failed messages (bodies omitted). */
export const GET = route(
  async (req) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 50 });
    const where = {
      ...(sp.channel ? { channel: sp.channel as OutboxChannel } : {}),
      ...(sp.status ? { status: sp.status as OutboxStatus } : {}),
      ...(sp.template ? { template: sp.template } : {}),
    };
    const r = await cursorList<{ id: string }>(
      db.outbox,
      {
        where,
        select: {
          id: true,
          channel: true,
          provider: true,
          to: true,
          template: true,
          subject: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          sentAt: true,
        },
      },
      p,
    );
    return NextResponse.json({ data: r.rows, page: { next: r.next, prev: r.prev, total: r.total } });
  },
  { permission: "comms:read" },
);
