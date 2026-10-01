export type TemplateMessage = {
  /** Digits only, with country code, e.g. 919800000000 */
  to: string;
  template: string;
  language?: string;
  variables: string[];
};
export type SendResult = { providerMessageId: string };

export interface WhatsAppAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  sendTemplate(message: TemplateMessage): Promise<SendResult>;
}

export const WHATSAPP_ENV: Record<string, string[]> = {
  mock: [],
  gupshup: ["GUPSHUP_API_KEY", "GUPSHUP_SOURCE_NUMBER", "GUPSHUP_APP_NAME"],
  interakt: ["INTERAKT_API_KEY"],
  meta: ["META_WA_TOKEN", "META_WA_PHONE_NUMBER_ID"],
};
