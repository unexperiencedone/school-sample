export type CaptchaChallenge = { token: string; image: string; expiresAt: string };

export interface CaptchaAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  /** Which client widget to render. */
  readonly widget: "image" | "turnstile" | "recaptcha" | "none";
  /** Only image captcha issues server-side challenges. */
  issue?(): Promise<CaptchaChallenge>;
  /** `response` is the user's answer (image) or the widget token (turnstile/recaptcha). */
  verify(input: { token?: string; response?: string; ip?: string }): Promise<boolean>;
}

export const CAPTCHA_ENV: Record<string, string[]> = {
  image: ["AUTH_SECRET"],
  turnstile: ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_CAPTCHA_SITE_KEY"],
  recaptcha: ["RECAPTCHA_SECRET_KEY", "NEXT_PUBLIC_CAPTCHA_SITE_KEY"],
  none: [],
};
