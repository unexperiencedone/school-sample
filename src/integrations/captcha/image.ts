import { createHmac, randomBytes, randomInt } from "node:crypto";
import { signToken, verifyToken } from "@/lib/tokens";
import type { CaptchaAdapter, CaptchaChallenge } from "./types";

/**
 * Self-hosted image captcha: a distorted SVG of 5 characters plus noise.
 * The answer never leaves the server in clear: the token carries HMAC(answer, nonce) and an expiry,
 * and each token is single-use (consumed via the UsedToken table).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const TTL = 10 * 60;

export function answerHash(answer: string, nonce: string): string {
  return createHmac("sha256", `${process.env.AUTH_SECRET ?? "dev"}:captcha-answer`)
    .update(`${answer.toUpperCase()}:${nonce}`)
    .digest("hex");
}

export function renderCaptchaSvg(text: string): string {
  const w = 180;
  const h = 56;
  const glyphs = text
    .split("")
    .map((c, i) => {
      const x = 20 + i * 30 + randomInt(-3, 4);
      const y = 38 + randomInt(-5, 6);
      const rot = randomInt(-22, 23);
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#3d1d38">${c}</text>`;
    })
    .join("");
  const lines = Array.from({ length: 6 }, () => {
    const c = ["#b4583a", "#e3a72f", "#6b5a66"][randomInt(0, 3)];
    return `<path d="M${randomInt(0, w)} ${randomInt(0, h)} Q ${randomInt(0, w)} ${randomInt(0, h)} ${randomInt(0, w)} ${randomInt(0, h)}" stroke="${c}" stroke-width="${randomInt(1, 3)}" fill="none" opacity="0.7"/>`;
  }).join("");
  const dots = Array.from(
    { length: 40 },
    () => `<circle cx="${randomInt(0, w)}" cy="${randomInt(0, h)}" r="1" fill="#6b5a66" opacity="0.5"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f6efe3"/>${dots}${glyphs}${lines}</svg>`;
}

export class ImageCaptchaAdapter implements CaptchaAdapter {
  readonly name = "image";
  readonly mode = "MOCK" as const;
  readonly widget = "image" as const;

  async issue(): Promise<CaptchaChallenge> {
    const answer = Array.from({ length: 5 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join("");
    const nonce = randomBytes(12).toString("base64url");
    const token = signToken("captcha", { n: nonce, h: answerHash(answer, nonce) }, TTL);
    const image = `data:image/svg+xml;base64,${Buffer.from(renderCaptchaSvg(answer)).toString("base64")}`;
    return { token, image, expiresAt: new Date(Date.now() + TTL * 1000).toISOString() };
  }

  async verify({ token, response }: { token?: string; response?: string }): Promise<boolean> {
    if (!token || !response) return false;
    const payload = verifyToken<{ n: string; h: string }>("captcha", token);
    if (!payload) return false;
    if (answerHash(response.trim(), payload.n) !== payload.h) return false;
    const { consumeToken } = await import("@/lib/single-use");
    return consumeToken(`captcha:${payload.n}`, new Date(payload.exp * 1000));
  }
}
