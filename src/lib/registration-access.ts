import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { signToken, verifyToken } from "@/lib/tokens";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

/** Registration drafts are anonymous; the browser holds a signed draft token (7 days) for its application id. */
export function draftToken(applicationId: string): string {
  return signToken("registration-draft", { id: applicationId }, 7 * 86400);
}

/** Allows: the draft-token holder, the applicant who owns the application, or staff with applications:write. */
export async function assertApplicationAccess(req: Request, applicationId: string) {
  const token = req.headers.get("x-draft-token");
  if (token && verifyToken<{ id: string }>("registration-draft", token)?.id === applicationId) {
    return db.application.findUniqueOrThrow({ where: { id: applicationId } });
  }
  const user = await getCurrentUser();
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) throw new ApiError(404, "NOT_FOUND", "Application not found");
  if (user && (app.applicantUserId === user.id || can(user.role, "applications:write"))) return app;
  throw new ApiError(
    user ? 403 : 401,
    user ? "FORBIDDEN" : "UNAUTHENTICATED",
    "You can't access this application",
  );
}
