import "server-only";
import { headers } from "next/headers";

export async function requestMeta(): Promise<{ ip: string; userAgent: string }> {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
  } catch {
    return { ip: "unknown", userAgent: "" };
  }
}

export function ipFrom(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
