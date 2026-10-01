import { hmacSha256Hex, randomId } from "../crypto";
import { IntegrationError } from "../errors";

/**
 * Outbound lead/application webhook so the school can attach Zoho, HubSpot, LeadSquared etc. later.
 * Payload is normalised and HMAC-signed: header `x-aurelia-signature: sha256=<hex>` over the raw body.
 * Delivery and retries (exponential backoff) are driven by the Outbox table and the outbox-retry cron.
 */
export type LeadWebhookEvent =
  | "lead.created"
  | "lead.status_changed"
  | "tour.booked"
  | "application.registered"
  | "application.stage_changed"
  | "application.admitted";

export type LeadWebhookPayload = {
  id: string;
  event: LeadWebhookEvent;
  occurredAt: string;
  school: string;
  data: {
    leadId?: string;
    applicationId?: string;
    status?: string;
    parent?: { name: string; email: string; phone: string };
    child?: { name?: string; dob?: string; classApplying?: string; boarding?: string };
    source?: string;
    utm?: Record<string, string | null | undefined>;
    [k: string]: unknown;
  };
};

export const WEBHOOK_ENV = ["LEAD_WEBHOOK_URL", "LEAD_WEBHOOK_SECRET"];

export function isLeadWebhookEnabled(): boolean {
  return !!process.env.LEAD_WEBHOOK_URL;
}

export function buildPayload(
  event: LeadWebhookEvent,
  data: LeadWebhookPayload["data"],
  school: string,
): LeadWebhookPayload {
  return { id: randomId("evt"), event, occurredAt: new Date().toISOString(), school, data };
}

export function signWebhookBody(body: string, secret = process.env.LEAD_WEBHOOK_SECRET ?? ""): string {
  return `sha256=${hmacSha256Hex(secret, body)}`;
}

export async function deliverLeadWebhook(payload: LeadWebhookPayload): Promise<{ status: number }> {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) throw new IntegrationError("Lead webhook", "LEAD_WEBHOOK_URL not set");
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-aurelia-event": payload.event,
      "x-aurelia-delivery": payload.id,
      "x-aurelia-signature": signWebhookBody(body),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new IntegrationError("Lead webhook", `HTTP ${res.status}`, res.status);
  return { status: res.status };
}

/** Backoff schedule for retries: 1m, 5m, 30m, 2h, 12h, then give up. */
export function nextRetryDelayMs(attempt: number): number | null {
  const schedule = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
  return schedule[attempt - 1] ?? null;
}
