import { hmacSha256Base64, safeEqual } from "../crypto";
import { requireEnv } from "../errors";
import { providerFetch } from "./http";
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
 * Cashfree Payment Gateway (PG API version 2023-08-01).
 * Docs: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
 * Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV (sandbox|production).
 * Payment ids are encoded as `${order_id}:${cf_payment_id}` because Cashfree scopes payments to an order.
 */
const API = () =>
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const VERSION = "2023-08-01";

type CfOrder = {
  order_id: string;
  order_amount: number;
  order_status: "ACTIVE" | "PAID" | "EXPIRED";
  payment_session_id: string;
};
type CfPayment = {
  cf_payment_id: string | number;
  order_id: string;
  payment_amount: number;
  payment_status: string;
  payment_group?: string;
};
type CfWebhook = {
  type: string;
  data: {
    order: { order_id: string };
    payment?: CfPayment & { payment_message?: string };
    refund?: {
      cf_refund_id: string;
      refund_amount: number;
      cf_payment_id: string | number;
      order_id: string;
    };
  };
};

const GROUP: Record<string, PaymentMethodCode> = {
  upi: "UPI",
  credit_card: "CARD",
  debit_card: "CARD",
  net_banking: "NETBANKING",
  wallet: "WALLET",
};
const toPaise = (rupees: number) => Math.round(rupees * 100);

export class CashfreeAdapter implements PaymentAdapter {
  readonly name = "cashfree";
  readonly mode = "LIVE" as const;

  private headers(idempotencyKey?: string): Record<string, string> {
    const [id, secret] = requireEnv("Cashfree", ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"]);
    return {
      "x-client-id": id,
      "x-client-secret": secret,
      "x-api-version": VERSION,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    };
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const orderId = `AH_${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(-40)}`;
    const o = await providerFetch<CfOrder>("Cashfree", `${API()}/orders`, {
      method: "POST",
      headers: this.headers(input.idempotencyKey),
      body: JSON.stringify({
        order_id: orderId,
        order_amount: input.amountPaise / 100,
        order_currency: "INR",
        customer_details: {
          customer_id: input.customer.id ?? orderId,
          customer_name: input.customer.name,
          customer_email: input.customer.email,
          customer_phone: input.customer.phone.replace(/\D/g, "").slice(-10),
        },
        order_meta: { return_url: `${input.returnUrl}?order_id={order_id}`, notify_url: input.webhookUrl },
        order_note: input.receipt,
        order_tags: input.notes,
      }),
    });
    return {
      providerOrderId: o.order_id,
      amountPaise: toPaise(o.order_amount),
      currency: "INR",
      status: o.order_status === "PAID" ? "paid" : "created",
      raw: o,
    };
  }

  getCheckout(order: Order): Checkout {
    const raw = order.raw as CfOrder | undefined;
    return {
      type: "inline",
      scriptSrc: "https://sdk.cashfree.com/js/v3/cashfree.js",
      params: {
        mode: process.env.CASHFREE_ENV === "production" ? "production" : "sandbox",
        paymentSessionId: raw?.payment_session_id,
        redirectTarget: "_self",
      },
    };
  }

  async verifyPayment({ orderId, paymentId }: VerifyInput): Promise<VerifyResult> {
    // Cashfree recommends server-side status fetch rather than client signatures.
    const p = await this.fetchPayment(`${orderId}:${paymentId}`);
    return p.status === "captured" ? { valid: true } : { valid: false, reason: `payment status ${p.status}` };
  }

  async handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent[]> {
    const [, secret] = requireEnv("Cashfree", ["CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"]);
    const ts = headers.get("x-webhook-timestamp") ?? "";
    const sig = headers.get("x-webhook-signature") ?? "";
    if (!sig || !safeEqual(hmacSha256Base64(secret, ts + rawBody), sig))
      throw new WebhookSignatureError("cashfree");
    const body = JSON.parse(rawBody) as CfWebhook;
    const p = body.data.payment;
    const eventId = `${body.type}:${p?.cf_payment_id ?? body.data.refund?.cf_refund_id}:${ts}`;
    if (body.type === "PAYMENT_SUCCESS_WEBHOOK" && p)
      return [
        {
          eventId,
          type: "payment.captured",
          providerOrderId: body.data.order.order_id,
          paymentId: `${body.data.order.order_id}:${p.cf_payment_id}`,
          amountPaise: toPaise(p.payment_amount),
          method: GROUP[p.payment_group ?? ""] ?? "UPI",
          raw: body,
        },
      ];
    if (body.type === "PAYMENT_FAILED_WEBHOOK" && p)
      return [
        {
          eventId,
          type: "payment.failed",
          providerOrderId: body.data.order.order_id,
          paymentId: `${body.data.order.order_id}:${p.cf_payment_id}`,
          amountPaise: toPaise(p.payment_amount),
          reason: p.payment_message,
          raw: body,
        },
      ];
    const r = body.data.refund;
    if (body.type === "REFUND_STATUS_WEBHOOK" && r)
      return [
        {
          eventId,
          type: "refund.processed",
          paymentId: `${r.order_id}:${r.cf_payment_id}`,
          refundId: r.cf_refund_id,
          amountPaise: toPaise(r.refund_amount),
          raw: body,
        },
      ];
    return [];
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const [orderId, cfPaymentId] = paymentId.split(":");
    const p = await providerFetch<CfPayment>(
      "Cashfree",
      `${API()}/orders/${orderId}/payments/${cfPaymentId}`,
      { headers: this.headers() },
    );
    const status =
      p.payment_status === "SUCCESS" ? "captured" : p.payment_status === "FAILED" ? "failed" : "pending";
    return {
      paymentId,
      providerOrderId: p.order_id,
      amountPaise: toPaise(p.payment_amount),
      status,
      method: GROUP[p.payment_group ?? ""],
    };
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const [orderId] = input.paymentId.split(":");
    const r = await providerFetch<{
      cf_refund_id: string;
      refund_status: "SUCCESS" | "PENDING" | "CANCELLED";
      refund_amount: number;
    }>("Cashfree", `${API()}/orders/${orderId}/refunds`, {
      method: "POST",
      headers: this.headers(input.idempotencyKey),
      body: JSON.stringify({
        refund_amount: input.amountPaise / 100,
        refund_id: input.idempotencyKey.slice(-40),
        refund_note: input.reason.slice(0, 100),
      }),
    });
    return {
      refundId: r.cf_refund_id,
      status:
        r.refund_status === "SUCCESS" ? "processed" : r.refund_status === "PENDING" ? "pending" : "failed",
      amountPaise: toPaise(r.refund_amount),
    };
  }
}
