import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { verifyToken } from "@/lib/tokens";
import { completeUpload } from "@/lib/services/uploads";

export const runtime = "nodejs";

/** PUT /api/uploads/local?token= — receiver for the local storage adapter's signed upload URLs. */
export const PUT = route(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyToken<{ key: string; mime: string; maxBytes: number }>("upload", token);
  if (!claims) throw new ApiError(403, "BAD_TOKEN", "Upload link is invalid or has expired");
  if ((req.headers.get("content-type") ?? "").split(";")[0] !== claims.mime)
    throw new ApiError(415, "BAD_TYPE", "Content-Type doesn't match the requested upload");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > claims.maxBytes) throw new ApiError(413, "TOO_LARGE", "File is larger than requested");
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > claims.maxBytes) throw new ApiError(413, "TOO_LARGE", "File is larger than requested");
  const result = await completeUpload(claims.key, data);
  return NextResponse.json(result);
});
