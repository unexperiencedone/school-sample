import { MockSmsAdapter, Msg91Adapter, TwilioAdapter } from "./providers";
import type { SmsAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => SmsAdapter> = {
  mock: () => new MockSmsAdapter(),
  msg91: () => new Msg91Adapter(),
  twilio: () => new TwilioAdapter(),
};

export function getSmsAdapter(name = process.env.SMS_PROVIDER || "mock"): SmsAdapter {
  const f = factories[name];
  if (!f) throw new Error(`Unknown SMS_PROVIDER "${name}"`);
  return f();
}
export const SMS_PROVIDERS = Object.keys(factories);
