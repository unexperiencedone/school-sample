import { hmacSha256Hex, randomId, safeEqual } from "../crypto";
import {
  type Checkout,
  type CreateOrderInput,
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
 * Mock gateway. No network. Mirrors Razorpay's conventions so the downstream code path is identical:
 *  - checkout signature  = HMAC_SHA256(`${orderId}|${paymentId}`, MOCK_WEBHOOK_SECRET)
 *  - webhook signature   = HMAC_SHA256(rawBody, MOCK_WEBHOOK_SECRET) in `x-mock-signature`
 *  - webhook event id    = `x-mock-event-id` header (also `id` in the body)
 * The fake checkout screen lives at /mock-pay/[orderId] and posts signed events to /api/payments/webhook/mock.
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export const MOCK_EVENT_ID_HEADER = "x-mock-event-id";

export function mockSecret(): string {
  return process.env.MOCK_WEBHOOK_SECRET || "dev-mock-webhook-secret";
}

export function signMockCheckout(orderId: string, paymentId: string): string {
  return hmacSha256Hex(mockSecret(), `${orderId}|${paymentId}`);
}

export function signMockWebhook(rawBody: string): string {
  return hmacSha256Hex(mockSecret(), rawBody);
}

/** Body shape the mock checkout sends (deliberately Razorpay-like). */
export type MockWebhookBody = {
  id: string;
  event: "payment.captured" | "payment.failed" | "refund.processed";
  created_at: number;
  payload: {
    payment?: {
      id: string;
      order_id: string;
      amount: number;
      method: string;
      status: string;
      error?: string;
    };
    refund?: { id: string; payment_id: string; amount: number };
  };
};

const METHOD_MAP: Record<string, PaymentMethodCode> = {
  upi: "UPI",
  card: "CARD",
  netbanking: "NETBANKING",
  wallet: "WALLET",
};

export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = "mock";
  readonly mode = "MOCK" as const;

  async createOrder(input: CreateOrderInput): Promise<Order> {
    return {
      providerOrderId: randomId("mock_order"),
      amountPaise: input.amountPaise,
      currency: "INR",
      status: "created",
    };
  }

  getCheckout(order: Order): Checkout {
    return { type: "redirect", url: `/mock-pay/${order.providerOrderId}`, method: "GET" };
  }

  async verifyPayment({ orderId, paymentId, signature }: VerifyInput): Promise<VerifyResult> {
    const expected = signMockCheckout(orderId, paymentId);
    return safeEqual(expected, signature) ? { valid: true } : { valid: false, reason: "signature mismatch" };
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    const signature = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    if (!signature || !safeEqual(signMockWebhook(rawBody), signature))
      throw new WebhookSignatureError("mock");
    const body = JSON.parse(rawBody) as MockWebhookBody;
    const eventId = headers.get(MOCK_EVENT_ID_HEADER) ?? body.id;
    const p = body.payload.payment;
    if (body.event === "payment.captured" && p)
      return [
        {
          eventId,
          type: "payment.captured",
          providerOrderId: p.order_id,
          paymentId: p.id,
          amountPaise: p.amount,
          method: METHOD_MAP[p.method] ?? "UPI",
          raw: body,
        },
      ];
    if (body.event === "payment.failed" && p)
      return [
        {
          eventId,
          type: "payment.failed",
          providerOrderId: p.order_id,
          paymentId: p.id,
          amountPaise: p.amount,
          reason: p.error,
          raw: body,
        },
      ];
    const r = body.payload.refund;
    if (body.event === "refund.processed" && r)
      return [
        {
          eventId,
          type: "refund.processed",
          paymentId: r.payment_id,
          refundId: r.id,
          amountPaise: r.amount,
          raw: body,
        },
      ];
    return [];
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    // The mock gateway has no ledger of its own; the app's Payment table is the source of truth.
    const { db } = await import("@/lib/db");
    const payment = await db.payment.findUnique({
      where: { providerPaymentId: paymentId },
      include: { order: true },
    });
    if (!payment) return { paymentId, providerOrderId: "", amountPaise: 0, status: "pending" };
    return {
      paymentId,
      providerOrderId: payment.order?.providerOrderId ?? "",
      amountPaise: payment.amountPaise,
      status: payment.refundedPaise >= payment.amountPaise ? "refunded" : "captured",
    };
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    return {
      refundId: `mock_rfnd_${input.idempotencyKey.slice(-12)}`,
      status: "processed",
      amountPaise: input.amountPaise,
    };
  }
}
