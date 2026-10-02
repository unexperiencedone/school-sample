import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { getDraft } from "@/lib/services/staff-applications";

export const dynamic = "force-dynamic";

/** GET /api/staff-applications/[id]?token= — the saved draft (or just the status once submitted). */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const rl = await rateLimit(`staff-app-read:${ipFrom(req)}`, 120, 3600);
  if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later.");
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-resume-token") ?? undefined;
  const draft = await getDraft(params.id, token);
  return NextResponse.json(draft, { headers: { "Cache-Control": "no-store" } });
});
