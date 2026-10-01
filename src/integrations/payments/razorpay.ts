import { hmacSha256Hex, safeEqual } from "../crypto";
import { requireEnv } from "../errors";
import { basicAuth, providerFetch } from "./http";
import {
  type Checkout,
  type CreateOrderInput,
  type Customer,
  type GatewayPayment,
  type GatewayRefund,
  type Order,
  type PaymentAdapter,
  type PaymentMethodCode,
  type RefundInput,
  type VerifyInput,
  type VerifyResult,
  type WebhookEvent,
  WebhookSignatureError,
} from "./types";

/**
 * Razorpay adapter (Orders API + Standard Checkout).
 * Docs: https://razorpay.com/docs/api/orders/ · https://razorpay.com/docs/webhooks/
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET. Throws NotConfiguredError until set.
 */
const API = "https://api.razorpay.com/v1";

type RzpOrder = { id: string; amount: number; currency: "INR"; status: "created" | "attempted" | "paid" };
type RzpPayment = { id: string; order_id: string; amount: number; status: string; method: string };
type RzpRefund = { id: string; amount: number; status: "pending" | "processed" | "failed" };
type RzpWebhook = {
  event: string;
  payload: {
    payment?: { entity: RzpPayment & { error_description?: string } };
    refund?: { entity: RzpRefund & { payment_id: string } };
  };
};

const METHOD: Record<string, PaymentMethodCode> = {
  upi: "UPI",
  card: "CARD",
  netbanking: "NETBANKING",
  wallet: "WALLET",
};

export class RazorpayAdapter implements PaymentAdapter {
  readonly name = "razorpay";
  readonly mode = "LIVE" as const;

  private creds() {
    const [keyId, keySecret] = requireEnv("Razorpay", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]);
    return { keyId, keySecret, auth: basicAuth(keyId, keySecret) };
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const { auth } = this.creds();
    const order = await providerFetch<RzpOrder>("Razorpay", `${API}/orders`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        notes: { ...input.notes, idempotency_key: input.idempotencyKey },
      }),
    });
    return {
      providerOrderId: order.id,
      amountPaise: order.amount,
      currency: "INR",
      status: order.status,
      raw: order,
    };
  }

  getCheckout(order: Order, ctx: { customer: Customer; description: string; returnUrl: string }): Checkout {
    const { keyId } = this.creds();
    return {
      type: "inline",
      scriptSrc: "https://checkout.razorpay.com/v1/checkout.js",
      params: {
        key: keyId,
        order_id: order.providerOrderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "School fees",
        description: ctx.description,
        prefill: { name: ctx.customer.name, email: ctx.customer.email, contact: ctx.customer.phone },
        callback_url: ctx.returnUrl,
        redirect: true,
      },
    };
  }

  async verifyPayment({ orderId, paymentId, signature }: VerifyInput): Promise<VerifyResult> {
    const { keySecret } = this.creds();
    const expected = hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
    return safeEqual(expected, signature)
      ? { valid: true }
      : { valid: false, reason: "razorpay_signature mismatch" };
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    const [secret] = requireEnv("Razorpay", ["RAZORPAY_WEBHOOK_SECRET"]);
    const signature = headers.get("x-razorpay-signature") ?? "";
    if (!signature || !safeEqual(hmacSha256Hex(secret, rawBody), signature))
      throw new WebhookSignatureError("razorpay");
    const body = JSON.parse(rawBody) as RzpWebhook;
    const eventId =
      headers.get("x-razorpay-event-id") ??
      `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id}`;
    const p = body.payload.payment?.entity;
    switch (body.event) {
      case "payment.captured":
        return p
          ? [
              {
                eventId,
                type: "payment.captured",
                providerOrderId: p.order_id,
                paymentId: p.id,
                amountPaise: p.amount,
                method: METHOD[p.method] ?? "CARD",
                raw: body,
              },
            ]
          : [];
      case "payment.failed":
        return p
          ? [
              {
                eventId,
                type: "payment.failed",
                providerOrderId: p.order_id,
                paymentId: p.id,
                amountPaise: p.amount,
                reason: p.error_description,
                raw: body,
              },
            ]
          : [];
      case "refund.processed": {
        const r = body.payload.refund?.entity;
        return r
          ? [
              {
                eventId,
                type: "refund.processed",
                paymentId: r.payment_id,
                refundId: r.id,
                amountPaise: r.amount,
                raw: body,
              },
            ]
          : [];
      }
      default:
        return [];
    }
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const { auth } = this.creds();
    const p = await providerFetch<RzpPayment>(
      "Razorpay",
      `${API}/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: auth },
      },
    );
    const status =
      p.status === "captured"
        ? "captured"
        : p.status === "failed"
          ? "failed"
          : p.status === "refunded"
            ? "refunded"
            : "pending";
    return {
      paymentId: p.id,
      providerOrderId: p.order_id,
      amountPaise: p.amount,
      status,
      method: METHOD[p.method],
    };
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const { auth } = this.creds();
    const r = await providerFetch<RzpRefund>(
      "Razorpay",
      `${API}/payments/${encodeURIComponent(input.paymentId)}/refund`,
      {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: input.amountPaise,
          speed: "normal",
          receipt: input.idempotencyKey.slice(0, 40),
          notes: { reason: input.reason.slice(0, 250) },
        }),
      },
    );
    return { refundId: r.id, status: r.status, amountPaise: r.amount };
  }
}
