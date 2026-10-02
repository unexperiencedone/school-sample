import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { addNote, getApplication, moveStage, saveScorecard } from "@/lib/services/careers-admin";
import { BOARD_STAGES, scorecardInput } from "@/lib/services/careers-admin-rules";

/** GET /api/admin/staff-applications/[id] — the whole application with its scorecard and notes. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const app = await getApplication(user!, params.id);
    if (!app) throw new ApiError(404, "NOT_FOUND", "Application not found");
    return NextResponse.json({ data: app });
  },
  { permission: "careers:read" },
);

const patchSchema = z
  .object({
    status: z.enum(BOARD_STAGES).optional(),
    reason: z.string().trim().max(500).optional(),
    scorecard: scorecardInput.optional(),
    note: z.string().optional(),
  })
  .refine((v) => v.status || v.scorecard || v.note !== undefined, "Send a status, a scorecard or a note");

/**
 * PATCH /api/admin/staff-applications/[id] — `status` (+ `reason`, required for REJECTED), `scorecard` (five ratings
 * 1–5 and an optional `comment`; the total becomes `score`) and/or `note`. Applied in that order.
 */
export const PATCH = route<{ id: string }>(
  async (req, { params, user }) => {
    const body = await parseJson(req, patchSchema);
    if (body.status) await moveStage(user!, params.id, body.status, body.reason);
    if (body.scorecard) await saveScorecard(user!, params.id, body.scorecard);
    if (body.note !== undefined) await addNote(user!, params.id, body.note);
    const app = await getApplication(user!, params.id);
    return NextResponse.json({ data: app });
  },
  { permission: "careers:write" },
);
