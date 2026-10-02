import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { safeEqual } from "@/integrations/crypto";
import { db } from "@/lib/db";
import { JOBS, type JobName } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled jobs: `late-fees` (nightly), `reminders` (daily, morning IST), `outbox-retry` (every 15 minutes).
 * Called by Vercel Cron, GitHub Actions or any scheduler with `Authorization: Bearer $CRON_SECRET`.
 * Jobs are idempotent, so a retried or duplicated call is harmless.
 */
async function run(req: Request, { params }: { params: { job: string } }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(503, "NOT_CONFIGURED", "CRON_SECRET is not set");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEqual(given, secret)) throw new ApiError(401, "UNAUTHORIZED", "Invalid cron secret");
  if (!(params.job in JOBS)) throw new ApiError(404, "UNKNOWN_JOB", `No job called "${params.job}"`);
  const started = Date.now();
  const run = await db.cronRun.create({ data: { job: params.job } });
  try {
    const result = await JOBS[params.job as JobName]();
    await db.cronRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, result: result as object },
    });
    return NextResponse.json({ job: params.job, ok: true, ms: Date.now() - started, result });
  } catch (e) {
    await db.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        result: { error: e instanceof Error ? e.message : String(e) },
      },
    });
    throw e;
  }
}

/** GET /api/cron/[job] — runs a scheduled job (the method Vercel Cron uses). Needs the cron secret as a bearer token. */
export const GET = route<{ job: string }>(run);
/** POST /api/cron/[job] — runs a scheduled job from any other scheduler. Needs the cron secret as a bearer token. */
export const POST = route<{ job: string }>(run);
