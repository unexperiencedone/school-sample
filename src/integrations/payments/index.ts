import { CashfreeAdapter } from "./cashfree";
import { MockPaymentAdapter } from "./mock";
import { PayUAdapter } from "./payu";
import { RazorpayAdapter } from "./razorpay";
import type { PaymentAdapter } from "./types";

export * from "./types";

const factories: Record<string, () => PaymentAdapter> = {
  mock: () => new MockPaymentAdapter(),
  razorpay: () => new RazorpayAdapter(),
  payu: () => new PayUAdapter(),
  cashfree: () => new CashfreeAdapter(),
};

const cache = new Map<string, PaymentAdapter>();

/** The configured gateway. Switching providers is an env change: PAYMENT_PROVIDER=razorpay plus its keys. */
export function getPaymentAdapter(name = process.env.PAYMENT_PROVIDER || "mock"): PaymentAdapter {
  const factory = factories[name];
  if (!factory)
    throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Use one of: ${Object.keys(factories).join(", ")}`);
  if (!cache.has(name)) cache.set(name, factory());
  return cache.get(name)!;
}

export const PAYMENT_PROVIDERS = Object.keys(factories);
