import { NextResponse } from "next/server";
import { ApiError, parseJson, route } from "@/lib/api";
import { newsletterSchema } from "@/lib/schemas/lead";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { db } from "@/lib/db";

/** POST /api/newsletter — double-submit safe (upsert), honeypot, rate limited. */
export const POST = route(async (req) => {
  const rl = await rateLimit(`newsletter:${ipFrom(req)}`, 5, 600);
  if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try later.");
  const data = await parseJson(req, newsletterSchema);
  if (!data.website) {
    await db.newsletterSubscriber.upsert({
      where: { email: data.email },
      create: { email: data.email, consentAt: new Date() },
      update: {},
    });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
});
