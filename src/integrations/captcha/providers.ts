import { requireEnv } from "../errors";
import type { CaptchaAdapter } from "./types";

/** Cloudflare Turnstile. POST https://challenges.cloudflare.com/turnstile/v0/siteverify */
export class TurnstileAdapter implements CaptchaAdapter {
  readonly name = "turnstile";
  readonly mode = "LIVE" as const;
  readonly widget = "turnstile" as const;
  async verify({ token, ip }: { token?: string; ip?: string }): Promise<boolean> {
    const [secret] = requireEnv("Turnstile", ["TURNSTILE_SECRET_KEY"]);
    if (!token) return false;
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const body = (await res.json()) as { success: boolean };
    return body.success;
  }
}

/** Google reCAPTCHA v2/v3. POST https://www.google.com/recaptcha/api/siteverify */
export class RecaptchaAdapter implements CaptchaAdapter {
  readonly name = "recaptcha";
  readonly mode = "LIVE" as const;
  readonly widget = "recaptcha" as const;
  async verify({ token, ip }: { token?: string; ip?: string }): Promise<boolean> {
    const [secret] = requireEnv("reCAPTCHA", ["RECAPTCHA_SECRET_KEY"]);
    if (!token) return false;
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const body = (await res.json()) as { success: boolean; score?: number };
    return body.success && (body.score === undefined || body.score >= 0.5);
  }
}

/** Disables captcha (honeypot + rate limiting still apply). Not recommended in production. */
export class NoCaptchaAdapter implements CaptchaAdapter {
  readonly name = "none";
  readonly mode = "MOCK" as const;
  readonly widget = "none" as const;
  async verify(): Promise<boolean> {
    return true;
  }
}
