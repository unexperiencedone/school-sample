import { safeEqual, sha512Hex } from "../crypto";
import { IntegrationError, requireEnv } from "../errors";
import { providerFetch } from "./http";
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
 * PayU India hosted checkout (form POST to /_payment) with SHA-512 request/response hashes.
 * Docs: https://docs.payu.in/docs/generate-hash-merchant-hosted
 * Env: PAYU_MERCHANT_KEY, PAYU_MERCHANT_SALT, PAYU_ENV (test|live).
 * PayU has no separate "order" object: our txnid acts as the provider order id.
 */
const BASE = () => (process.env.PAYU_ENV === "live" ? "https://secure.payu.in" : "https://test.payu.in");
const INFO = () => (process.env.PAYU_ENV === "live" ? "https://info.payu.in" : "https://test.payu.in");

const rupeeString = (paise: number) => (paise / 100).toFixed(2);
const toPaise = (amount: string) => Math.round(Number(amount) * 100);
const METHOD: Record<string, PaymentMethodCode> = {
  UPI: "UPI",
  CC: "CARD",
  DC: "CARD",
  NB: "NETBANKING",
  CASH: "WALLET",
};

type PayUPost = Record<string, string>;

export class PayUAdapter implements PaymentAdapter {
  readonly name = "payu";
  readonly mode = "LIVE" as const;

  private creds() {
    const [key, salt] = requireEnv("PayU", ["PAYU_MERCHANT_KEY", "PAYU_MERCHANT_SALT"]);
    return { key, salt };
  }

  /** sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT) */
  requestHash(p: {
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    udf1?: string;
  }): string {
    const { key, salt } = this.creds();
    return sha512Hex(
      [
        key,
        p.txnid,
        p.amount,
        p.productinfo,
        p.firstname,
        p.email,
        p.udf1 ?? "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        salt,
      ].join("|"),
    );
  }

  /** Reverse hash: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key) */
  responseHash(p: PayUPost): string {
    const { key, salt } = this.creds();
    return sha512Hex(
      [
        salt,
        p.status,
        "",
        "",
        "",
        "",
        "",
        p.udf5 ?? "",
        p.udf4 ?? "",
        p.udf3 ?? "",
        p.udf2 ?? "",
        p.udf1 ?? "",
        p.email,
        p.firstname,
        p.productinfo,
        p.amount,
        p.txnid,
        key,
      ].join("|"),
    );
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    this.creds();
    const txnid = `AH${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(-20)}`;
    return { providerOrderId: txnid, amountPaise: input.amountPaise, currency: "INR", status: "created" };
  }

  getCheckout(order: Order, ctx: { customer: Customer; description: string; returnUrl: string }): Checkout {
    const { key } = this.creds();
    const amount = rupeeString(order.amountPaise);
    const productinfo = ctx.description.slice(0, 100);
    const firstname = ctx.customer.name.split(" ")[0] ?? ctx.customer.name;
    const params = {
      key,
      txnid: order.providerOrderId,
      amount,
      productinfo,
      firstname,
      email: ctx.customer.email,
      phone: ctx.customer.phone,
      surl: ctx.returnUrl,
      furl: ctx.returnUrl,
      hash: this.requestHash({
        txnid: order.providerOrderId,
        amount,
        productinfo,
        firstname,
        email: ctx.customer.email,
      }),
    };
    return { type: "redirect", method: "POST", url: `${BASE()}/_payment`, params };
  }

  async verifyPayment({ signature, orderId, paymentId }: VerifyInput): Promise<VerifyResult> {
    // For PayU the "signature" is the JSON-encoded response POST; we recompute the reverse hash.
    const post = JSON.parse(signature) as PayUPost;
    if (post.txnid !== orderId || post.mihpayid !== paymentId)
      return { valid: false, reason: "txnid/mihpayid mismatch" };
    return safeEqual(this.responseHash(post), post.hash ?? "")
      ? { valid: true }
      : { valid: false, reason: "hash mismatch" };
  }

  async handleWebhook(rawBody: string): Promise<WebhookEvent[]> {
    const post = Object.fromEntries(new URLSearchParams(rawBody)) as PayUPost;
    if (!post.hash || !safeEqual(this.responseHash(post), post.hash)) throw new WebhookSignatureError("payu");
    const eventId = `payu:${post.mihpayid}:${post.status}`;
    const amountPaise = toPaise(post.amount);
    if (post.status === "success")
      return [
        {
          eventId,
          type: "payment.captured",
          providerOrderId: post.txnid,
          paymentId: post.mihpayid,
          amountPaise,
          method: METHOD[post.mode] ?? "CARD",
          raw: post,
        },
      ];
    if (post.status === "failure")
      return [
        {
          eventId,
          type: "payment.failed",
          providerOrderId: post.txnid,
          paymentId: post.mihpayid,
          amountPaise,
          reason: post.error_Message,
          raw: post,
        },
      ];
    return [];
  }

  private async postService<T>(
    command: string,
    var1: string,
    extra: Record<string, string> = {},
  ): Promise<T> {
    const { key, salt } = this.creds();
    const form = new URLSearchParams({
      key,
      command,
      var1,
      hash: sha512Hex(`${key}|${command}|${var1}|${salt}`),
      ...extra,
    });
    return providerFetch<T>("PayU", `${INFO()}/merchant/postservice.php?form=2`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const res = await this.postService<{
      transaction_details?: Record<string, { status: string; txnid: string; amt: string; mode: string }>;
    }>("check_payment", paymentId);
    const t = res.transaction_details?.[paymentId];
    if (!t) throw new IntegrationError("PayU", `payment ${paymentId} not found`);
    return {
      paymentId,
      providerOrderId: t.txnid,
      amountPaise: toPaise(t.amt),
      status: t.status === "success" ? "captured" : t.status === "failure" ? "failed" : "pending",
      method: METHOD[t.mode],
    };
  }

  async refund(input: RefundInput): Promise<GatewayRefund> {
    const res = await this.postService<{ status: number; request_id?: string; msg?: string }>(
      "cancel_refund_transaction",
      input.paymentId,
      {
        var2: input.idempotencyKey.slice(0, 23),
        var3: rupeeString(input.amountPaise),
      },
    );
    if (res.status !== 1) throw new IntegrationError("PayU", res.msg ?? "refund rejected", undefined, res);
    return {
      refundId: res.request_id ?? input.idempotencyKey,
      status: "pending",
      amountPaise: input.amountPaise,
    };
  }
}
