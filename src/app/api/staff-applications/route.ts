import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { captchaFields } from "@/lib/schemas/common";
import { assertCaptcha } from "@/lib/captcha-check";
import { rateLimit } from "@/lib/rate-limit";
import { ipFrom } from "@/lib/request";
import { createOrUpdateDraft, submit } from "@/lib/services/staff-applications";
import { STEPS } from "@/lib/schemas/staff-application";

/** A full application is a few tens of kilobytes; anything near this is not a person filling in a form. */
const MAX_BODY_BYTES = 256 * 1024;

const envelope = z.object({
  id: z.string().min(1).max(40).optional(),
  token: z.string().min(16).max(200).optional(),
  vacancySlug: z.string().max(120).nullable().optional(),
  step: z.number().int().min(1).max(STEPS.length),
  data: z.record(z.string(), z.unknown()),
  action: z.enum(["save", "submit"]),
  ...captchaFields,
});

const HOUR = 3600;

/**
 * POST /api/staff-applications — save one step of the public staff application, or submit it.
 *
 * - First save (no `id`, step 1): creates the draft; the response carries `resumeToken` once.
 * - Later saves and submit need `id` + `token`; each step is validated with the same schemas as the form.
 * - Submit validates every step (422 INCOMPLETE with per-step issues) and checks the captcha.
 * - The honeypot (`website`) silently succeeds.
 */
export const POST = route(async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    throw new ApiError(413, "TOO_LARGE", "That request is too large.");
  const ip = ipFrom(req);
  const body = await parseJson(req, envelope);

  const limit =
    body.action === "submit"
      ? { key: `staff-app-submit:${ip}`, max: 10 }
      : body.id
        ? { key: `staff-app-save:${ip}`, max: 150 }
        : { key: `staff-app-new:${ip}`, max: 8 };
  const rl = await rateLimit(limit.key, limit.max, HOUR);
  if (!rl.ok)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many requests from this network. Please try again in ${Math.ceil(rl.retryAfter / 60)} minutes.`,
    );

  if (body.website)
    return NextResponse.json(
      {
        id: "ignored",
        ref: "SA-THANKS",
        status: body.action === "submit" ? "RECEIVED" : "DRAFT",
        currentStep: body.step,
      },
      { status: 201 },
    );

  if (body.action === "submit") {
    if (!body.id || body.step !== STEPS.length)
      throw new ApiError(422, "BAD_SUBMIT", "Submit from the declaration step of a saved application.");
    await assertCaptcha(body, ip);
    const done = await submit({ id: body.id, token: body.token, data: body.data });
    return NextResponse.json({ id: done.id, ref: done.ref, status: "RECEIVED" });
  }

  const saved = await createOrUpdateDraft({
    id: body.id,
    token: body.token,
    vacancySlug: body.vacancySlug,
    step: body.step,
    data: body.data,
  });
  return NextResponse.json(saved, { status: saved.resumeToken ? 201 : 200 });
});
