import "server-only";
import { getCaptcha } from "@/integrations/captcha";
import { ApiError } from "@/lib/api";

/** Server-side captcha verification shared by every public form. */
export async function assertCaptcha(
  input: { captchaToken?: string; captchaAnswer?: string },
  ip?: string,
): Promise<void> {
  const captcha = getCaptcha();
  const ok =
    captcha.widget === "image"
      ? await captcha.verify({ token: input.captchaToken, response: input.captchaAnswer })
      : await captcha.verify({ token: input.captchaToken, ip });
  if (!ok)
    throw new ApiError(422, "CAPTCHA_FAILED", "The security check didn't match. Please try the new code.", {
      fieldErrors: { captchaAnswer: ["That code didn't match — here's a new one"] },
    });
}
