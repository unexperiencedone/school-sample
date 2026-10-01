import { CAPTCHA_ENV } from "./captcha/types";
import { WEBHOOK_ENV } from "./crm-webhook";
import { EMAIL_ENV } from "./email/types";
import { envPresence } from "./errors";
import { MAPS_ENV } from "./maps";
import { PAYMENT_ENV } from "./payments/types";
import { SMS_ENV } from "./sms/types";
import { STORAGE_ENV } from "./storage/types";
import { WHATSAPP_ENV } from "./whatsapp/types";

export type IntegrationStatus = {
  key: string;
  label: string;
  envVar: string;
  provider: string;
  options: string[];
  mode: "MOCK" | "LIVE" | "OFF";
  env: { name: string; present: boolean }[];
  ready: boolean;
  testable: boolean;
};

const MOCKISH = new Set(["mock", "local", "image", "none", "static"]);

function entry(
  key: string,
  label: string,
  envVar: string,
  fallback: string,
  table: Record<string, string[]>,
  testable = true,
): IntegrationStatus {
  const provider = process.env[envVar] || fallback;
  const env = envPresence(table[provider] ?? []);
  return {
    key,
    label,
    envVar,
    provider,
    options: Object.keys(table),
    mode: MOCKISH.has(provider) ? "MOCK" : "LIVE",
    env,
    ready: env.every((e) => e.present) || MOCKISH.has(provider),
    testable,
  };
}

/** Shared by /admin/settings/integrations and scripts/verify-env.ts. */
export function integrationStatuses(): IntegrationStatus[] {
  const webhookEnv = envPresence(WEBHOOK_ENV);
  return [
    entry("payments", "Payments", "PAYMENT_PROVIDER", "mock", PAYMENT_ENV),
    entry("email", "Email", "EMAIL_PROVIDER", "mock", EMAIL_ENV),
    entry("whatsapp", "WhatsApp", "WHATSAPP_PROVIDER", "mock", WHATSAPP_ENV),
    entry("sms", "SMS", "SMS_PROVIDER", "mock", SMS_ENV),
    entry("storage", "File storage", "STORAGE_PROVIDER", "local", STORAGE_ENV),
    entry("captcha", "Captcha", "CAPTCHA_PROVIDER", "image", CAPTCHA_ENV),
    entry("maps", "Maps", "MAPS_PROVIDER", "static", MAPS_ENV, false),
    {
      key: "lead-webhook",
      label: "Lead/CRM webhook",
      envVar: "LEAD_WEBHOOK_URL",
      provider: process.env.LEAD_WEBHOOK_URL ? "custom" : "disabled",
      options: ["disabled", "custom"],
      mode: process.env.LEAD_WEBHOOK_URL ? "LIVE" : "OFF",
      env: webhookEnv,
      ready: !process.env.LEAD_WEBHOOK_URL || webhookEnv.every((e) => e.present),
      testable: !!process.env.LEAD_WEBHOOK_URL,
    },
    {
      key: "analytics",
      label: "Analytics (consent-gated)",
      envVar: "NEXT_PUBLIC_GTM_ID",
      provider:
        ["GTM", "GA4", "META_PIXEL", "LINKEDIN_PARTNER", "CLARITY"]
          .filter((p) => process.env[`NEXT_PUBLIC_${p}_ID`])
          .join(", ") || "none",
      options: ["GTM", "GA4", "Meta Pixel", "LinkedIn", "Clarity"],
      mode: ["GTM", "GA4", "META_PIXEL", "LINKEDIN_PARTNER", "CLARITY"].some(
        (p) => process.env[`NEXT_PUBLIC_${p}_ID`],
      )
        ? "LIVE"
        : "OFF",
      env: envPresence([
        "NEXT_PUBLIC_GTM_ID",
        "NEXT_PUBLIC_GA4_ID",
        "NEXT_PUBLIC_META_PIXEL_ID",
        "NEXT_PUBLIC_LINKEDIN_PARTNER_ID",
        "NEXT_PUBLIC_CLARITY_ID",
      ]),
      ready: true,
      testable: false,
    },
  ];
}
