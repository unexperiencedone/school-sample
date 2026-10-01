import { GupshupAdapter, InteraktAdapter, MetaCloudAdapter, MockWhatsAppAdapter } from "./providers";
import type { WhatsAppAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => WhatsAppAdapter> = {
  mock: () => new MockWhatsAppAdapter(),
  gupshup: () => new GupshupAdapter(),
  interakt: () => new InteraktAdapter(),
  meta: () => new MetaCloudAdapter(),
};

export function getWhatsAppAdapter(name = process.env.WHATSAPP_PROVIDER || "mock"): WhatsAppAdapter {
  const f = factories[name];
  if (!f) throw new Error(`Unknown WHATSAPP_PROVIDER "${name}"`);
  return f();
}
export const WHATSAPP_PROVIDERS = Object.keys(factories);
