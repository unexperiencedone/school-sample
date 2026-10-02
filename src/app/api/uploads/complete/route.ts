import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { verifyToken } from "@/lib/tokens";
import { completeStoredUpload } from "@/lib/services/uploads";

export const runtime = "nodejs";

/**
 * POST /api/uploads/complete?token= — called by the browser after it uploaded straight to the object store (S3).
 * The server fetches the file back, checks its size and magic bytes and runs the scan hook; a bad file is deleted.
 */
export const POST = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyToken<{ key: string }>("upload-complete", token);
  if (!claims) throw new ApiError(403, "BAD_TOKEN", "This upload link is invalid or has expired");
  return NextResponse.json(await completeStoredUpload(claims.key));
});
