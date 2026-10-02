import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/lib/tokens";
import { MockPaymentAdapter, signMockCheckout, signMockWebhook } from "@/integrations/payments/mock";
import { RazorpayAdapter } from "@/integrations/payments/razorpay";
import { getPaymentAdapter, WebhookSignatureError } from "@/integrations/payments";
import { NotConfiguredError } from "@/integrations/errors";
import { hmacSha256Hex } from "@/integrations/crypto";
import { S3StorageAdapter } from "@/integrations/storage/s3";
import { sniffMatches } from "@/integrations/storage";
import { signWebhookBody, nextRetryDelayMs } from "@/integrations/crm-webhook";
import { integrationStatuses } from "@/integrations/registry";

describe("signed tokens", () => {
  it("round-trips, binds purpose and expires", () => {
    const t = signToken("upload", { key: "a/b.pdf" }, 60);
    expect(verifyToken<{ key: string }>("upload", t)?.key).toBe("a/b.pdf");
    expect(verifyToken("download", t)).toBeNull();
    expect(
      verifyToken(
        "upload",
        t.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
      ),
    ).toBeNull();
    expect(verifyToken("upload", signToken("upload", {}, -1))).toBeNull();
  });
});

describe("mock payment adapter", () => {
  const adapter = new MockPaymentAdapter();
  const body = JSON.stringify({
    id: "evt_1",
    event: "payment.captured",
    created_at: 1,
    payload: {
      payment: { id: "pay_1", order_id: "order_1", amount: 1000, method: "upi", status: "captured" },
    },
  });

  it("verifies checkout signatures", async () => {
    expect(
      await adapter.verifyPayment({ orderId: "o", paymentId: "p", signature: signMockCheckout("o", "p") }),
    ).toEqual({ valid: true });
    expect((await adapter.verifyPayment({ orderId: "o", paymentId: "p", signature: "x" })).valid).toBe(false);
  });

  it("parses signed webhooks and rejects tampered ones", async () => {
    const headers = new Headers({ "x-mock-signature": signMockWebhook(body) });
    const [evt] = await adapter.handleWebhook(body, headers);
    expect(evt).toMatchObject({
      eventId: "evt_1",
      type: "payment.captured",
      paymentId: "pay_1",
      amountPaise: 1000,
      method: "UPI",
    });
    await expect(adapter.handleWebhook(body.replace("1000", "9000"), headers)).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    await expect(adapter.handleWebhook(body, new Headers())).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("returns a redirect checkout to the mock gateway", async () => {
    const order = await adapter.createOrder({
      amountPaise: 100,
      currency: "INR",
      receipt: "r",
      customer: { name: "A", email: "a@b.test", phone: "1" },
      idempotencyKey: "k",
      returnUrl: "/r",
      webhookUrl: "/w",
    });
    expect(adapter.getCheckout(order)).toEqual({
      type: "redirect",
      url: `/mock-pay/${order.providerOrderId}`,
      method: "GET",
    });
  });
});

describe("razorpay adapter (offline)", () => {
  it("throws NotConfiguredError without keys", async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(
      new RazorpayAdapter().verifyPayment({ orderId: "o", paymentId: "p", signature: "s" }),
    ).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it("verifies razorpay_signature and webhook HMAC with configured secrets", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
    const a = new RazorpayAdapter();
    const sig = hmacSha256Hex("secret", "order_1|pay_1");
    expect((await a.verifyPayment({ orderId: "order_1", paymentId: "pay_1", signature: sig })).valid).toBe(
      true,
    );
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_1", order_id: "order_1", amount: 500, status: "captured", method: "card" },
        },
      },
    });
    const events = await a.handleWebhook(
      body,
      new Headers({ "x-razorpay-signature": hmacSha256Hex("whsec", body), "x-razorpay-event-id": "e1" }),
    );
    expect(events[0]).toMatchObject({
      eventId: "e1",
      type: "payment.captured",
      amountPaise: 500,
      method: "CARD",
    });
    await expect(
      a.handleWebhook(body, new Headers({ "x-razorpay-signature": "bad" })),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"])
      delete process.env[k];
  });
});

describe("adapter factory and registry", () => {
  it("defaults to mock and rejects unknown providers", () => {
    expect(getPaymentAdapter().name).toBe("mock");
    expect(() => getPaymentAdapter("nope")).toThrow(/Unknown PAYMENT_PROVIDER/);
  });

  it("reports MOCK/LIVE status", () => {
    const payments = integrationStatuses().find((s) => s.key === "payments")!;
    expect(payments.mode).toBe("MOCK");
    expect(payments.options).toEqual(["mock", "razorpay", "payu", "cashfree"]);
  });
});

describe("storage", () => {
  it("sniffs magic bytes", () => {
    expect(sniffMatches(Buffer.from("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(sniffMatches(Buffer.from("<html>"), "application/pdf")).toBe(false);
  });

  it("presigns S3 URLs with SigV4 query parameters", () => {
    Object.assign(process.env, {
      S3_BUCKET: "b",
      S3_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "AKIA",
      AWS_SECRET_ACCESS_KEY: "s",
    });
    const url = new URL(
      new S3StorageAdapter().presign("PUT", "docs/a b.pdf", 600, new Date("2026-01-01T00:00:00Z")),
    );
    expect(url.host).toBe("b.s3.ap-south-1.amazonaws.com");
    expect(url.pathname).toBe("/docs/a%20b.pdf");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AKIA/20260101/ap-south-1/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    for (const k of ["S3_BUCKET", "S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"])
      delete process.env[k];
  });
});

describe("storage: S3-compatible stores", () => {
  it("accepts the standard AWS variable names and presigns path-style for a custom endpoint", () => {
    Object.assign(process.env, {
      S3_BUCKET: "students",
      AWS_REGION: "ap-southeast-1",
      AWS_ENDPOINT_URL_S3: "https://storage.example.test",
      AWS_ACCESS_KEY_ID: "AK",
      AWS_SECRET_ACCESS_KEY: "s",
    });
    const url = new URL(
      new S3StorageAdapter().presign("GET", "docs/a.pdf", 300, new Date("2026-01-01T00:00:00Z")),
    );
    expect(url.host).toBe("storage.example.test");
    expect(url.pathname).toBe("/students/docs/a.pdf");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AK/20260101/ap-southeast-1/s3/aws4_request");
    for (const k of [
      "S3_BUCKET",
      "AWS_REGION",
      "AWS_ENDPOINT_URL_S3",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ])
      delete process.env[k];
  });
});

describe("lead webhook", () => {
  it("signs bodies and backs off", () => {
    expect(signWebhookBody("{}", "k")).toBe(`sha256=${hmacSha256Hex("k", "{}")}`);
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(6)).toBeNull();
  });
});
