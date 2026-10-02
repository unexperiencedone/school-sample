import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { createCertificateUpload } from "@/lib/services/staff-applications";

const uploadRequest = z.object({
  slot: z.string().regex(/^education-\d{1,2}$/, "Unknown upload slot"),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

/**
 * POST /api/staff-applications/[id]/documents — signed upload target for one certificate (header x-resume-token).
 * The browser PUTs the file to the returned URL and keeps the returned `key` in its education row.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const rl = await rateLimit(`staff-app-upload:${ipFrom(req)}`, 60, 3600);
  if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", "Too many uploads. Please try again later.");
  const body = await parseJson(req, uploadRequest);
  const target = await createCertificateUpload({
    id: params.id,
    token: req.headers.get("x-resume-token") ?? undefined,
    ...body,
  });
  return NextResponse.json(target, { status: 201 });
});
