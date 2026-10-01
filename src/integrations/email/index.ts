import { MockEmailAdapter } from "./mock";
import { ResendEmailAdapter } from "./resend";
import { SesEmailAdapter } from "./ses";
import { SmtpEmailAdapter } from "./smtp";
import type { EmailAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => EmailAdapter> = {
  mock: () => new MockEmailAdapter(),
  smtp: () => new SmtpEmailAdapter(),
  ses: () => new SesEmailAdapter(),
  resend: () => new ResendEmailAdapter(),
};

export function getEmailAdapter(name = process.env.EMAIL_PROVIDER || "mock"): EmailAdapter {
  const f = factories[name];
  if (!f) throw new Error(`Unknown EMAIL_PROVIDER "${name}"`);
  return f();
}
export const EMAIL_PROVIDERS = Object.keys(factories);
