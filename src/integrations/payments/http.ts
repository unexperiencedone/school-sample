import { IntegrationError } from "../errors";

/** Small fetch wrapper for provider APIs: JSON in/out, timeout, typed error with status/body. */
export async function providerFetch<T>(
  integration: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (!res.ok) throw new IntegrationError(integration, `HTTP ${res.status}`, res.status, body);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}
