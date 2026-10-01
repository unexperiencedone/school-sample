import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApplicationStage } from "@prisma/client";
import { ApiError, parseJson, route } from "@/lib/api";
import { db } from "@/lib/db";
import { moveStage, TRANSITIONS } from "@/lib/services/admissions";

/** GET /api/admin/applications/[id] — application with documents and timeline. */
export const GET = route<{ id: string }>(
  async (_req, { params }) => {
    const app = await db.application.findUnique({
      where: { id: params.id },
      include: {
        documents: { select: { kind: true, status: true, fileName: true, note: true } },
        events: { orderBy: { createdAt: "desc" } },
        class: true,
        startYear: true,
      },
    });
    if (!app) throw new ApiError(404, "NOT_FOUND", "Application not found");
    return NextResponse.json({ data: app });
  },
  { permission: "applications:read" },
);

const schema = z.object({
  stage: z.enum(Object.keys(TRANSITIONS) as [ApplicationStage, ...ApplicationStage[]]),
  note: z.string().max(2000).optional(),
  planCode: z.enum(["ONE", "TWO", "THREE"]).optional(),
  message: z.string().max(1000).optional(),
  sectionId: z.string().optional(),
});

/** PATCH /api/admin/applications/[id] — move stage (validated state machine; decisions need applications:decide). */
export const PATCH = route<{ id: string }>(
  async (req, { params, user }) => {
    const b = await parseJson(req, schema);
    await moveStage(params.id, b.stage, user!, b.note, {
      planCode: b.planCode,
      message: b.message,
      sectionId: b.sectionId,
    });
    return NextResponse.json({ data: await db.application.findUnique({ where: { id: params.id } }) });
  },
  { permission: "applications:write" },
);
