import { randomId } from "../crypto";
import { requireEnv } from "../errors";
import { providerFetch } from "../payments/http";
import type { SendResult, TemplateMessage, WhatsAppAdapter } from "./types";

export class MockWhatsAppAdapter implements WhatsAppAdapter {
  readonly name = "mock";
  readonly mode = "MOCK" as const;
  async sendTemplate(): Promise<SendResult> {
    return { providerMessageId: randomId("mock_wa") };
  }
}

/** Gupshup template API. POST https://api.gupshup.io/wa/api/v1/template/msg (form-encoded, header `apikey`). */
export class GupshupAdapter implements WhatsAppAdapter {
  readonly name = "gupshup";
  readonly mode = "LIVE" as const;
  async sendTemplate(m: TemplateMessage): Promise<SendResult> {
    const [apiKey, source, appName] = requireEnv("Gupshup", [
      "GUPSHUP_API_KEY",
      "GUPSHUP_SOURCE_NUMBER",
      "GUPSHUP_APP_NAME",
    ]);
    const form = new URLSearchParams({
      channel: "whatsapp",
      source,
      destination: m.to,
      "src.name": appName,
      template: JSON.stringify({ id: m.template, params: m.variables }),
    });
    const res = await providerFetch<{ messageId: string }>(
      "Gupshup",
      "https://api.gupshup.io/wa/api/v1/template/msg",
      {
        method: "POST",
        headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    );
    return { providerMessageId: res.messageId };
  }
}

/** Interakt public API. POST https://api.interakt.ai/v1/public/message/ with Basic <api key>. */
export class InteraktAdapter implements WhatsAppAdapter {
  readonly name = "interakt";
  readonly mode = "LIVE" as const;
  async sendTemplate(m: TemplateMessage): Promise<SendResult> {
    const [key] = requireEnv("Interakt", ["INTERAKT_API_KEY"]);
    const res = await providerFetch<{ id: string }>(
      "Interakt",
      "https://api.interakt.ai/v1/public/message/",
      {
        method: "POST",
        headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: `+${m.to.slice(0, m.to.length - 10)}`,
          phoneNumber: m.to.slice(-10),
          type: "Template",
          template: { name: m.template, languageCode: m.language ?? "en", bodyValues: m.variables },
        }),
      },
    );
    return { providerMessageId: res.id };
  }
}

/** Meta WhatsApp Cloud API. POST https://graph.facebook.com/v20.0/{phone-number-id}/messages */
export class MetaCloudAdapter implements WhatsAppAdapter {
  readonly name = "meta";
  readonly mode = "LIVE" as const;
  async sendTemplate(m: TemplateMessage): Promise<SendResult> {
    const [token, phoneId] = requireEnv("Meta WhatsApp", ["META_WA_TOKEN", "META_WA_PHONE_NUMBER_ID"]);
    const res = await providerFetch<{ messages: { id: string }[] }>(
      "Meta WhatsApp",
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: m.to,
          type: "template",
          template: {
            name: m.template,
            language: { code: m.language ?? "en" },
            components: [{ type: "body", parameters: m.variables.map((text) => ({ type: "text", text })) }],
          },
        }),
      },
    );
    return { providerMessageId: res.messages[0]?.id ?? "" };
  }
}
