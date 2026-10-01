import nodemailer from "nodemailer";
import { requireEnv } from "../errors";
import type { EmailAdapter, EmailMessage, SendResult } from "./types";

/** Generic SMTP (any provider). Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM. */
export class SmtpEmailAdapter implements EmailAdapter {
  readonly name: string = "smtp";
  readonly mode = "LIVE" as const;

  protected host(): string {
    return requireEnv("SMTP", ["SMTP_HOST"])[0];
  }

  async send(m: EmailMessage): Promise<SendResult> {
    const [user, pass, from] = requireEnv(this.name.toUpperCase(), ["SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]);
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: this.host(),
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const info = await transport.sendMail({
      from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      replyTo: m.replyTo,
    });
    return { providerMessageId: info.messageId };
  }
}
