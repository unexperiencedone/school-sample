import { requireEnv } from "../errors";
import { providerFetch } from "../payments/http";
import type { EmailAdapter, EmailMessage, SendResult } from "./types";

/** Resend REST API. POST https://api.resend.com/emails. Env: RESEND_API_KEY, EMAIL_FROM. */
export class ResendEmailAdapter implements EmailAdapter {
  readonly name = "resend";
  readonly mode = "LIVE" as const;
  async send(m: EmailMessage): Promise<SendResult> {
    const [key, from] = requireEnv("Resend", ["RESEND_API_KEY", "EMAIL_FROM"]);
    const res = await providerFetch<{ id: string }>("Resend", "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        reply_to: m.replyTo,
      }),
    });
    return { providerMessageId: res.id };
  }
}
