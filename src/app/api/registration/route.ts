import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { childStep, boardingStep, parentsStep } from "@/lib/schemas/registration";
import { boardingAllowed } from "@/lib/schemas/registration";
import { createDraftApplication, updateDraft } from "@/lib/services/admissions";
import { assertApplicationAccess, draftToken } from "@/lib/registration-access";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { db } from "@/lib/db";

/**
 * POST /api/registration — create a draft application from step 1 (child). Returns { id, ref, draftToken }.
 * PATCH /api/registration — update later steps: { id, parents?, boarding?, declared? } with x-draft-token.
 */
export const POST = route(async (req) => {
  const rl = await rateLimit(`registration:${ipFrom(req)}`, 10, 3600);
  if (!rl.ok)
    throw new ApiError(429, "RATE_LIMITED", "Too many registrations from this network. Please try later.");
  const body = await parseJson(
    req,
    z.object({ child: childStep, utm: z.record(z.string().max(500)).optional() }),
  );
  const app = await createDraftApplication(body.child, body.utm);
  return NextResponse.json({ id: app.id, ref: app.ref, draftToken: draftToken(app.id) }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  child: childStep.optional(),
  parents: parentsStep.optional(),
  boarding: boardingStep.optional(),
  declared: z.literal(true).optional(),
});

/** PATCH /api/registration — save a later step (parents, boarding, declaration) of the draft; needs the draft token. */
export const PATCH = route(async (req) => {
  const body = await parseJson(req, patchSchema);
  const app = await assertApplicationAccess(req, body.id);
  if (body.boarding) {
    const cls = await db.classLevel.findUniqueOrThrow({ where: { id: body.child?.classId ?? app.classId } });
    if (!boardingAllowed(cls.order, body.boarding.boardingType)) {
      throw new ApiError(
        422,
        "BOARDING_NOT_OFFERED",
        `${body.boarding.boardingType.toLowerCase()} boarding isn't offered for ${cls.name}.`,
        { fieldErrors: { boardingType: ["Not offered for this class"] } },
      );
    }
  }
  const updated = await updateDraft(app.id, body);
  return NextResponse.json({ id: updated.id, ref: updated.ref, stage: updated.stage });
});
