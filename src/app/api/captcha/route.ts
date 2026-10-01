import { NextResponse } from "next/server";
import { getCaptcha } from "@/integrations/captcha";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/captcha — issues an image challenge (image provider) or tells the client which widget to render. */
export const GET = route(async () => {
  const captcha = getCaptcha();
  if (captcha.widget !== "image" || !captcha.issue) {
    return NextResponse.json({
      widget: captcha.widget,
      siteKey: process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY ?? null,
    });
  }
  const challenge = await captcha.issue();
  return NextResponse.json({ widget: "image", ...challenge }, { headers: { "Cache-Control": "no-store" } });
});
