import "server-only";
import { render } from "@react-email/render";
import { createElement } from "react";
import type { OutboxChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { school } from "@/config/school";
import { SchoolEmail } from "@/emails/school-email";
import { TEMPLATES, type TemplateKey } from "@/lib/messages/templates";
import { getEmailAdapter } from "@/integrations/email";
import { getWhatsAppAdapter } from "@/integrations/whatsapp";
import { getSmsAdapter } from "@/integrations/sms";
import {
  buildPayload,
  deliverLeadWebhook,
  isLeadWebhookEnabled,
  nextRetryDelayMs,
  type LeadWebhookEvent,
  type LeadWebhookPayload,
} from "@/integrations/crm-webhook";

/**
 * Every outbound message goes through here:
 *  1. render the template, 2. write an Outbox row (the audit trail and the mock "inbox"),
 *  3. respect per-contact consent, 4. dispatch through the configured adapter, 5. record result.
 * Failed sends are retried by /api/cron/outbox-retry with backoff.
 */
export type Recipient = {
  email?: string | null;
  phone?: string | null;
  consent?: { email?: boolean; whatsapp?: boolean; sms?: boolean };
};

export type SendOptions = {
  template: TemplateKey;
  to: Recipient;
  data?: Record<string, string | number | undefined>;
  channels?: ("EMAIL" | "WHATSAPP" | "SMS")[];
  related?: { type: string; id: string };
};

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export async function sendTemplate(opts: SendOptions): Promise<string[]> {
  const rendered = TEMPLATES[opts.template].render(opts.data ?? {});
  const channels = opts.channels ?? ["EMAIL", ...(rendered.whatsapp ? (["WHATSAPP"] as const) : [])];
  const ids: string[] = [];

  for (const channel of channels) {
    const consentKey = channel === "EMAIL" ? "email" : channel === "WHATSAPP" ? "whatsapp" : "sms";
    const consented = opts.to.consent?.[consentKey] ?? true;
    const to = channel === "EMAIL" ? opts.to.email : opts.to.phone ? normalisePhone(opts.to.phone) : null;
    if (!to) continue;
    if (channel === "WHATSAPP" && !rendered.whatsapp) continue;
    if (channel === "SMS" && !rendered.sms) continue;

    const body =
      channel === "EMAIL"
        ? await render(createElement(SchoolEmail, rendered.email))
        : channel === "WHATSAPP"
          ? `[${rendered.whatsapp!.template}] ${rendered.whatsapp!.variables.join(" | ")}`
          : rendered.sms!.text;

    const row = await db.outbox.create({
      data: {
        channel,
        provider: providerFor(channel),
        to,
        template: opts.template,
        subject: channel === "EMAIL" ? rendered.subject : null,
        body,
        payload: {
          data: opts.data ?? {},
          whatsapp: rendered.whatsapp,
          sms: rendered.sms,
        } as Prisma.InputJsonValue,
        status: consented ? "QUEUED" : "SKIPPED",
        lastError: consented ? null : "No consent for this channel",
        relatedType: opts.related?.type,
        relatedId: opts.related?.id,
      },
    });
    ids.push(row.id);
    if (consented) await dispatch(row.id);
  }
  return ids;
}

function providerFor(channel: OutboxChannel): string {
  switch (channel) {
    case "EMAIL":
      return process.env.EMAIL_PROVIDER || "mock";
    case "WHATSAPP":
      return process.env.WHATSAPP_PROVIDER || "mock";
    case "SMS":
      return process.env.SMS_PROVIDER || "mock";
    case "WEBHOOK":
      return "lead-webhook";
  }
}

/** Sends one Outbox row through its adapter. Safe to call repeatedly; only QUEUED/FAILED rows are sent. */
export async function dispatch(outboxId: string): Promise<void> {
  const row = await db.outbox.findUnique({ where: { id: outboxId } });
  if (!row || (row.status !== "QUEUED" && row.status !== "FAILED")) return;
  const attempts = row.attempts + 1;
  try {
    const payload = (row.payload ?? {}) as {
      whatsapp?: { template: string; variables: string[] };
      sms?: { templateId: string; text: string; variables: Record<string, string> };
      webhook?: LeadWebhookPayload;
    };
    if (row.channel === "EMAIL") {
      const text = row.body
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      await getEmailAdapter().send({ to: row.to, subject: row.subject ?? "", html: row.body, text });
    } else if (row.channel === "WHATSAPP" && payload.whatsapp) {
      await getWhatsAppAdapter().sendTemplate({ to: row.to, ...payload.whatsapp });
    } else if (row.channel === "SMS" && payload.sms) {
      await getSmsAdapter().send({ to: row.to, ...payload.sms });
    } else if (row.channel === "WEBHOOK" && payload.webhook) {
      await deliverLeadWebhook(payload.webhook);
    }
    await db.outbox.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), attempts, lastError: null, nextAttemptAt: null },
    });
  } catch (err) {
    const delay = nextRetryDelayMs(attempts);
    await db.outbox.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        attempts,
        lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
        nextAttemptAt: delay ? new Date(Date.now() + delay) : null,
      },
    });
  }
}

/** Queues the outbound CRM webhook (if LEAD_WEBHOOK_URL is set) and attempts delivery once. */
export async function emitLeadEvent(
  event: LeadWebhookEvent,
  data: LeadWebhookPayload["data"],
): Promise<void> {
  if (!isLeadWebhookEnabled()) return;
  const payload = buildPayload(event, data, school.name);
  const row = await db.outbox.create({
    data: {
      channel: "WEBHOOK",
      provider: "lead-webhook",
      to: process.env.LEAD_WEBHOOK_URL!,
      template: event,
      body: JSON.stringify(payload),
      payload: { webhook: payload } as unknown as Prisma.InputJsonValue,
      relatedType: data.applicationId ? "application" : "lead",
      relatedId: (data.applicationId ?? data.leadId) as string | undefined,
    },
  });
  await dispatch(row.id);
}

/** Cron: retry failed messages whose backoff has elapsed. */
export async function retryDueOutbox(limit = 50): Promise<{ retried: number }> {
  const due = await db.outbox.findMany({
    where: { status: "FAILED", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const r of due) await dispatch(r.id);
  return { retried: due.length };
}
