import { NextResponse } from "next/server";
import { ApiError, parseJson, route } from "@/lib/api";
import { leadSchema } from "@/lib/schemas/lead";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { assertCaptcha } from "@/lib/captcha-check";
import { createLeadFromForm } from "@/lib/services/leads";

/**
 * POST /api/leads — enquiry or campus-tour booking from any public placement.
 * Zod validation · honeypot · captcha · 5 requests / 10 min / IP · double-submit protection.
 */
export const POST = route(async (req) => {
  const ip = ipFrom(req);
  const rl = await rateLimit(`lead:${ip}`, 5, 600);
  if (!rl.ok)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many submissions. Please try again in ${Math.ceil(rl.retryAfter / 60)} minutes.`,
    );

  const data = await parseJson(req, leadSchema);
  if (data.website) return NextResponse.json({ ref: "ENQ-THANKS" }, { status: 201 }); // honeypot: silently accept
  await assertCaptcha(data, ip);

  const { ref, tour, duplicate } = await createLeadFromForm(data);
  return NextResponse.json({ ref, tour, duplicate }, { status: duplicate ? 200 : 201 });
});
