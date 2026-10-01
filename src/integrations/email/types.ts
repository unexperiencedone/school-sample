export type EmailMessage = { to: string; subject: string; html: string; text: string; replyTo?: string };
export type SendResult = { providerMessageId: string };

export interface EmailAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  send(message: EmailMessage): Promise<SendResult>;
}

export const EMAIL_ENV: Record<string, string[]> = {
  mock: [],
  smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"],
  ses: ["AWS_REGION", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"],
  resend: ["RESEND_API_KEY", "EMAIL_FROM"],
};
