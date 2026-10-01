export type SmsMessage = {
  /** Digits only, with country code */
  to: string;
  /** DLT-registered template id (India) or provider template/flow id */
  templateId: string;
  text: string;
  variables: Record<string, string>;
};
export type SendResult = { providerMessageId: string };

export interface SmsAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  send(message: SmsMessage): Promise<SendResult>;
}

export const SMS_ENV: Record<string, string[]> = {
  mock: [],
  msg91: ["MSG91_AUTH_KEY", "MSG91_SENDER_ID"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
};
