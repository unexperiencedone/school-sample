/** Provider-neutral payment gateway contract. Amounts are always integer paise. */

export type Customer = { name: string; email: string; phone: string; id?: string };

export type CreateOrderInput = {
  amountPaise: number;
  currency: "INR";
  receipt: string;
  customer: Customer;
  notes?: Record<string, string>;
  idempotencyKey: string;
  returnUrl: string;
  webhookUrl: string;
};

export type Order = {
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
  status: "created" | "attempted" | "paid";
  raw?: unknown;
};

export type Checkout = {
  type: "redirect" | "inline";
  url?: string;
  /** For inline checkouts (Razorpay/Cashfree JS) or form-POST redirects (PayU). */
  params?: Record<string, unknown>;
  method?: "GET" | "POST";
  scriptSrc?: string;
};

export type VerifyInput = { orderId: string; paymentId: string; signature: string };
export type VerifyResult = { valid: boolean; reason?: string };

export type PaymentMethodCode = "UPI" | "CARD" | "NETBANKING" | "WALLET";

export type WebhookEvent =
  | {
      eventId: string;
      type: "payment.captured";
      providerOrderId: string;
      paymentId: string;
      amountPaise: number;
      method: PaymentMethodCode;
      raw: unknown;
    }
  | {
      eventId: string;
      type: "payment.failed";
      providerOrderId: string;
      paymentId: string;
      amountPaise: number;
      reason?: string;
      raw: unknown;
    }
  | {
      eventId: string;
      type: "refund.processed";
      paymentId: string;
      refundId: string;
      amountPaise: number;
      raw: unknown;
    };

export type GatewayPayment = {
  paymentId: string;
  providerOrderId: string;
  amountPaise: number;
  status: "captured" | "failed" | "pending" | "refunded";
  method?: PaymentMethodCode;
};

export type RefundInput = { paymentId: string; amountPaise: number; reason: string; idempotencyKey: string };
export type GatewayRefund = {
  refundId: string;
  status: "processed" | "pending" | "failed";
  amountPaise: number;
};

export class WebhookSignatureError extends Error {
  readonly code = "BAD_SIGNATURE";
  constructor(provider: string) {
    super(`Invalid ${provider} webhook signature`);
  }
}

export interface PaymentAdapter {
  readonly name: string;
  readonly mode: "MOCK" | "LIVE";
  createOrder(input: CreateOrderInput): Promise<Order>;
  getCheckout(order: Order, ctx: { customer: Customer; description: string; returnUrl: string }): Checkout;
  verifyPayment(input: VerifyInput): Promise<VerifyResult>;
  /** Must verify the signature over the raw body and throw WebhookSignatureError when invalid. */
  handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  refund(input: RefundInput): Promise<GatewayRefund>;
}

export const PAYMENT_ENV: Record<string, string[]> = {
  mock: ["MOCK_WEBHOOK_SECRET"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  payu: ["PAYU_MERCHANT_KEY", "PAYU_MERCHANT_SALT"],
  cashfree: ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"],
};
