import { NextResponse } from "next/server";
import type { ApplicationStage, Prisma } from "@prisma/client";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { TRANSITIONS } from "@/lib/services/admissions";

/** GET /api/admin/applications?stage=&class=&year=&q=&sort=&dir=&size=&after=&before= */
export const GET = route(
  async (req) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: ["createdAt", "updatedAt", "stage"], defaultSort: "createdAt" });
    const stages = Object.keys(TRANSITIONS);
    const where: Prisma.ApplicationWhereInput = {
      ...(sp.stage && stages.includes(sp.stage) ? { stage: sp.stage as ApplicationStage } : {}),
      ...(sp.class ? { classId: sp.class } : {}),
      ...(sp.year ? { startYearId: sp.year } : {}),
      ...(sp.q
        ? {
            OR: [
              { ref: { contains: sp.q, mode: "insensitive" } },
              { childFirstName: { contains: sp.q, mode: "insensitive" } },
              { contactEmail: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const { rows, next, prev, total } = await cursorList<{ id: string }>(
      db.application,
      { where, include: { class: true, startYear: true } },
      p,
    );
    return NextResponse.json({ data: rows, page: { next, prev, total } });
  },
  { permission: "applications:read" },
);
