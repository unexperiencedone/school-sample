import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter stored in Postgres so it holds across server instances.
 * Returns { ok:false, retryAfter } when the caller exceeded `limit` hits per `windowSeconds`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const row = await db.rateLimitHit.upsert({
    where: { key_windowAt: { key, windowAt: windowStart } },
    create: { key, windowAt: windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  const retryAfter = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
  return { ok: row.count <= limit, retryAfter };
}

export async function purgeRateLimits(): Promise<void> {
  await db.rateLimitHit.deleteMany({ where: { windowAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
}
