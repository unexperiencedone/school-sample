import { createHmac } from "node:crypto";
import { safeEqual } from "@/integrations/crypto";

/**
 * Compact signed tokens (HMAC-SHA256 over a JSON payload) for captcha, upload/download URLs and resume links.
 * `purpose` is mixed into the key so a token minted for one use can't be replayed for another.
 */
function secret(purpose: string): string {
  const base = process.env.AUTH_SECRET;
  if (!base && process.env.NODE_ENV === "production")
    throw new Error("AUTH_SECRET is required in production");
  return `${base ?? "dev-only-secret"}:${purpose}`;
}

export function signToken<T extends object>(purpose: string, payload: T, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret(purpose)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken<T extends object>(purpose: string, token: string): (T & { exp: number }) | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret(purpose)).update(body).digest("base64url");
  if (!safeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
