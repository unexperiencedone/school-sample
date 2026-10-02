"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { processWebhook } from "@/lib/services/payments";
import { randomId } from "@/integrations/crypto";
import {
  MOCK_EVENT_ID_HEADER,
  MOCK_SIGNATURE_HEADER,
  signMockCheckout,
  signMockWebhook,
  type MockWebhookBody,
} from "@/integrations/payments/mock";

export type Outcome = "success" | "failure" | "pending" | "duplicate";

/**
 * Simulates the gateway: delivers a signed webhook through the real webhook handler — exactly what a gateway's
 * POST would trigger — then redirects the payer back to the return URL. "duplicate" delivers the same event twice to prove idempotency.
 */
export async function simulatePaymentForm(form: FormData): Promise<void> {
  const outcome = String(form.get("outcome")) as Outcome;
  if (!["success", "failure", "pending", "duplicate"].includes(outcome)) throw new Error("Bad outcome");
  const method = ["upi", "card", "netbanking"].includes(String(form.get("method")))
    ? String(form.get("method"))
    : "upi";
  await simulatePayment(String(form.get("orderId")), outcome, method);
}

export async function simulatePayment(
  providerOrderId: string,
  outcome: Outcome,
  method: string,
): Promise<void> {
  if (process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== "mock")
    throw new Error("Mock gateway is disabled");
  const order = await db.paymentOrder.findUnique({ where: { providerOrderId } });
  if (!order || order.provider !== "mock") throw new Error("Unknown order");
  const paymentId = randomId("mock_pay");
  const returnTo = new URL("/payments/return", "http://localhost");
  returnTo.searchParams.set("order_id", providerOrderId);

  if (outcome !== "pending") {
    const body: MockWebhookBody = {
      id: randomId("evt"),
      event: outcome === "failure" ? "payment.failed" : "payment.captured",
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          id: paymentId,
          order_id: providerOrderId,
          amount: order.amountPaise,
          method,
          status: outcome === "failure" ? "failed" : "captured",
          error: outcome === "failure" ? "Bank declined the transaction (simulated)" : undefined,
        },
      },
    };
    const raw = JSON.stringify(body);
    const deliveries = outcome === "duplicate" ? 2 : 1;
    // Delivered in-process through the same verifier and handler as /api/payments/webhook/mock, so it also works
    // where the app can't call its own URL (e.g. Vercel deployment protection on preview links).
    const signed = new Headers({
      "Content-Type": "application/json",
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(raw),
      [MOCK_EVENT_ID_HEADER]: body.id,
    });
    for (let i = 0; i < deliveries; i++) await processWebhook("mock", raw, signed);
    returnTo.searchParams.set("payment_id", paymentId);
    returnTo.searchParams.set("signature", signMockCheckout(providerOrderId, paymentId));
  }
  returnTo.searchParams.set("status", outcome === "duplicate" ? "success" : outcome);
  redirect(returnTo.pathname + returnTo.search);
}
