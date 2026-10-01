import { db } from "@/lib/db";
import { sha256Hex } from "@/integrations/crypto";

/** Marks a token as consumed. Returns false if it was already used (replay). */
export async function consumeToken(id: string, expiresAt: Date): Promise<boolean> {
  try {
    await db.usedToken.create({ data: { hash: sha256Hex(id), expiresAt } });
    return true;
  } catch {
    return false;
  }
}

export async function purgeExpiredTokens(): Promise<number> {
  const res = await db.usedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
