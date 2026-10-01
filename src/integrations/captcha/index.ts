import { ImageCaptchaAdapter } from "./image";
import { NoCaptchaAdapter, RecaptchaAdapter, TurnstileAdapter } from "./providers";
import type { CaptchaAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => CaptchaAdapter> = {
  image: () => new ImageCaptchaAdapter(),
  turnstile: () => new TurnstileAdapter(),
  recaptcha: () => new RecaptchaAdapter(),
  none: () => new NoCaptchaAdapter(),
};

export function getCaptcha(name = process.env.CAPTCHA_PROVIDER || "image"): CaptchaAdapter {
  const f = factories[name];
  if (!f) throw new Error(`Unknown CAPTCHA_PROVIDER "${name}"`);
  return f();
}
export const CAPTCHA_PROVIDERS = Object.keys(factories);
