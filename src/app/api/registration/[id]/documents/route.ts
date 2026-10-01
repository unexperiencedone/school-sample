import { NextResponse } from "next/server";
import { ApiError, parseJson, route } from "@/lib/api";
import { uploadRequestSchema } from "@/lib/schemas/registration";
import { assertApplicationAccess } from "@/lib/registration-access";
import { createUpload } from "@/lib/services/uploads";
import { db } from "@/lib/db";

/** POST /api/registration/[id]/documents — returns a signed upload target for one document slot. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const app = await assertApplicationAccess(req, params.id);
  if (["ADMITTED", "REJECTED", "WITHDRAWN"].includes(app.stage))
    throw new ApiError(409, "CLOSED", "This application is closed.");
  const body = await parseJson(req, uploadRequestSchema);
  const target = await createUpload({
    ownerType: "application",
    ownerId: app.id,
    slot: body.kind,
    fileName: body.fileName,
    mime: body.mime,
    size: body.size,
  });
  return NextResponse.json(target, { status: 201 });
});

/** GET /api/registration/[id]/documents — current document status for the application. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const app = await assertApplicationAccess(req, params.id);
  const docs = await db.applicationDocument.findMany({
    where: { applicationId: app.id },
    select: { kind: true, fileName: true, status: true, note: true, size: true },
  });
  return NextResponse.json({ data: docs });
});
