import { ApiError, route } from "@/lib/api";
import { verifyToken } from "@/lib/tokens";
import { getStorage } from "@/integrations/storage";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/files?token= — serves a stored file for a signed, short-lived download link (issued after an access check). */
export const GET = route(async (req) => {
  const claims = verifyToken<{ key: string }>("download", new URL(req.url).searchParams.get("token") ?? "");
  if (!claims) throw new ApiError(403, "BAD_TOKEN", "Download link is invalid or has expired");
  const upload = await db.upload.findUnique({ where: { key: claims.key } });
  if (!upload || upload.status !== "STORED") throw new ApiError(404, "NOT_FOUND", "File not found");
  const data = await getStorage().get(claims.key);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": upload.mime,
      "Content-Disposition": `inline; filename="${upload.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
