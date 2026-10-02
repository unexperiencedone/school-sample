import "server-only";
import type { OrderPurpose, PaymentMethod, PaymentOrder, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api";
import {
  getPaymentAdapter,
  WebhookSignatureError,
  type Checkout,
  type Customer,
  type PaymentMethodCode,
  type WebhookEvent,
} from "@/integrations/payments";
import { sha256Hex } from "@/integrations/crypto";
import { siteUrl } from "@/config/school";
import { istDateOnly } from "@/lib/dates";
import { recordPayment } from "./ledger";

/**
 * Payment orchestration shared by every flow (registration, invoices, instalments, imprest top-ups):
 *   createPaymentOrder → gateway checkout → signed webhook → processWebhook → recordPayment (idempotent)
 * Side effects (emails, user creation, CRM webhooks) run only after the database transaction commits.
 */

export type Effect = () => Promise<void>;

export type CreateOrderInput = {
  purpose: OrderPurpose;
  amountPaise: number;
  customer: Customer;
  description: string;
  idempotencyKey: string;
  returnPath: string;
  invoiceId?: string | null;
  instalmentId?: string | null;
  applicationId?: string | null;
  studentId?: string | null;
  notes?: Record<string, string>;
};

export async function createPaymentOrder(
  input: CreateOrderInput,
): Promise<{ order: PaymentOrder; checkout: Checkout; reused: boolean }> {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100)
    throw new ApiError(422, "BAD_AMOUNT", "Amount must be at least ₹1");
  const existing = await db.paymentOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.status === "PAID")
      throw new ApiError(409, "ALREADY_PAID", "This payment has already been completed.");
    if (
      existing.amountPaise !== input.amountPaise ||
      existing.purpose !== input.purpose ||
      (existing.studentId ?? null) !== (input.studentId ?? null) ||
      (existing.invoiceId ?? null) !== (input.invoiceId ?? null) ||
      (existing.instalmentId ?? null) !== (input.instalmentId ?? null)
    )
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "A different payment was already requested with this key.",
      );
    return { order: existing, checkout: existing.checkout as unknown as Checkout, reused: true };
  }
  const adapter = getPaymentAdapter();
  const returnUrl = `${siteUrl()}/payments/return?ref=${encodeURIComponent(input.idempotencyKey)}`;
  const webhookUrl = `${siteUrl()}/api/payments/webhook/${adapter.name}`;
  const receipt = `${input.purpose.slice(0, 3)}-${sha256Hex(input.idempotencyKey).slice(0, 12)}`;
  const gatewayOrder = await adapter.createOrder({
    amountPaise: input.amountPaise,
    currency: "INR",
    receipt,
    customer: input.customer,
    notes: { purpose: input.purpose, ...input.notes },
    idempotencyKey: input.idempotencyKey,
    returnUrl,
    webhookUrl,
  });
  const checkout = adapter.getCheckout(gatewayOrder, {
    customer: input.customer,
    description: input.description,
    returnUrl,
  });
  try {
    const order = await db.paymentOrder.create({
      data: {
        provider: adapter.name,
        providerOrderId: gatewayOrder.providerOrderId,
        idempotencyKey: input.idempotencyKey,
        purpose: input.purpose,
        amountPaise: input.amountPaise,
        receipt,
        customer: input.customer as unknown as Prisma.InputJsonValue,
        notes: {
          description: input.description,
          returnPath: input.returnPath,
          ...input.notes,
        } as Prisma.InputJsonValue,
        returnUrl: input.returnPath,
        checkout: checkout as unknown as Prisma.InputJsonValue,
        invoiceId: input.invoiceId ?? undefined,
        instalmentId: input.instalmentId ?? undefined,
        applicationId: input.applicationId ?? undefined,
        studentId: input.studentId ?? undefined,
      },
    });
    return { order, checkout, reused: false };
  } catch (e) {
    // Lost a race with a concurrent identical request: return the winner.
    const winner = await db.paymentOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (winner) return { order: winner, checkout: winner.checkout as unknown as Checkout, reused: true };
    throw e;
  }
}

const METHOD: Record<PaymentMethodCode, PaymentMethod> = {
  UPI: "UPI",
  CARD: "CARD",
  NETBANKING: "NETBANKING",
  WALLET: "WALLET",
};

/** Applies a captured gateway payment inside a transaction. Idempotent on providerPaymentId. */
async function applyCapture(
  tx: Tx,
  provider: string,
  e: Extract<WebhookEvent, { type: "payment.captured" }>,
  effects: Effect[],
) {
  const order = await tx.paymentOrder.findUnique({ where: { providerOrderId: e.providerOrderId } });
  if (!order) throw new Error(`Unknown order ${e.providerOrderId}`);
  const notes =
    e.amountPaise !== order.amountPaise
      ? `Amount differs from order (${order.amountPaise} paise ordered)`
      : null;
  const allocate =
    order.purpose === "REGISTRATION" || order.purpose === "IMPREST_TOPUP"
      ? false
      : { invoiceId: order.invoiceId, instalmentId: order.instalmentId };
  const result = await recordPayment(tx, {
    provider,
    providerPaymentId: e.paymentId,
    method: METHOD[e.method],
    amountPaise: e.amountPaise,
    orderId: order.id,
    studentId: order.studentId,
    applicationId: order.applicationId,
    notes,
    allocate,
  });
  if (result.duplicate) return;
  await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "PAID" } });

  switch (order.purpose) {
    case "REGISTRATION": {
      const { onRegistrationPaid } = await import("./admissions");
      effects.push(...(await onRegistrationPaid(tx, order, result.payment, result.receipt!)));
      break;
    }
    case "IMPREST_TOPUP": {
      if (order.studentId) {
        const day = istDateOnly(new Date());
        const term = await tx.term.findFirst({ where: { startDate: { lte: day }, endDate: { gte: day } } });
        await tx.imprestEntry.create({
          data: {
            studentId: order.studentId,
            termId: term?.id,
            kind: "CREDIT",
            category: "TOP_UP",
            amountPaise: e.amountPaise,
            description: `Online top-up (${result.receipt!.number})`,
          },
        });
      }
      break;
    }
    default: {
      const { onFeePaymentRecorded } = await import("./invoices");
      effects.push(...(await onFeePaymentRecorded(tx, order, result.payment, result.receipt!)));
    }
  }
}

export type WebhookResult = { received: number; processed: number; duplicates: number; errors: string[] };

/**
 * Verifies and applies a gateway webhook. Two independent idempotency guards:
 *  1. WebhookEvent unique (provider, eventId) — a replayed delivery is ignored;
 *  2. Payment unique providerPaymentId — the same payment under a new event id is still credited once.
 */
export async function processWebhook(
  provider: string,
  rawBody: string,
  headers: Headers,
): Promise<WebhookResult> {
  const adapter = getPaymentAdapter(provider);
  let events: WebhookEvent[];
  try {
    events = await adapter.handleWebhook(rawBody, headers);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      await db.webhookEvent.create({
        data: {
          provider,
          eventId: `invalid:${sha256Hex(rawBody).slice(0, 24)}:${Date.now()}`,
          type: "invalid_signature",
          payload: safeJson(rawBody),
          signatureValid: false,
          error: "Signature verification failed",
        },
      });
      throw new ApiError(401, "BAD_SIGNATURE", "Invalid webhook signature");
    }
    throw err;
  }

  const result: WebhookResult = { received: events.length, processed: 0, duplicates: 0, errors: [] };
  for (const e of events) {
    try {
      await db.webhookEvent.create({
        data: {
          provider,
          eventId: e.eventId,
          type: e.type,
          payload: e.raw as Prisma.InputJsonValue,
          signatureValid: true,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        result.duplicates++;
        continue;
      }
      throw err;
    }
    const effects: Effect[] = [];
    try {
      await db.$transaction(
        async (tx) => {
          if (e.type === "payment.captured") await applyCapture(tx, provider, e, effects);
          else if (e.type === "payment.failed") {
            await tx.paymentOrder.updateMany({
              where: { providerOrderId: e.providerOrderId, status: { not: "PAID" } },
              data: { status: "ATTEMPTED" },
            });
          } else if (e.type === "refund.processed") {
            const { onRefundProcessed } = await import("./refunds");
            effects.push(...(await onRefundProcessed(tx, e)));
          }
          await tx.webhookEvent.update({
            where: { provider_eventId: { provider, eventId: e.eventId } },
            data: { processedAt: new Date() },
          });
        },
        { timeout: 20_000 },
      );
      result.processed++;
    } catch (err) {
      // A concurrent delivery of the same payment under another event id lost the unique-key race: already credited.
      if ((err as { code?: string }).code === "P2002") {
        result.duplicates++;
        await db.webhookEvent.update({
          where: { provider_eventId: { provider, eventId: e.eventId } },
          data: { processedAt: new Date(), error: "duplicate payment (concurrent)" },
        });
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      await db.webhookEvent.update({
        where: { provider_eventId: { provider, eventId: e.eventId } },
        data: { error: message.slice(0, 1000) },
      });
      continue;
    }
    for (const fx of effects) await fx().catch((err) => console.error("payment effect failed", err));
  }
  return result;
}

/**
 * Client-return verification (e.g. Razorpay's handler response). Checks the signature and, if the webhook hasn't
 * landed yet, fetches the payment from the gateway and applies it through the same idempotent path.
 */
export async function verifyReturn(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ status: "paid" | "pending" | "failed"; order: PaymentOrder | null }> {
  const order = await db.paymentOrder.findUnique({ where: { providerOrderId: input.orderId } });
  if (!order) return { status: "failed", order: null };
  if (order.status === "PAID") return { status: "paid", order };
  const adapter = getPaymentAdapter(order.provider);
  const v = await adapter.verifyPayment(input);
  if (!v.valid) return { status: "failed", order };
  const gp = await adapter.fetchPayment(input.paymentId);
  if (gp.status !== "captured") return { status: gp.status === "failed" ? "failed" : "pending", order };
  const effects: Effect[] = [];
  const eventId = `verify:${input.paymentId}`;
  const fresh = await db.webhookEvent.upsert({
    where: { provider_eventId: { provider: order.provider, eventId } },
    create: {
      provider: order.provider,
      eventId,
      type: "payment.captured",
      payload: { via: "client-verify", ...input },
      signatureValid: true,
    },
    update: {},
  });
  if (!fresh.processedAt) {
    await db.$transaction(async (tx) => {
      await applyCapture(
        tx,
        order.provider,
        {
          eventId,
          type: "payment.captured",
          providerOrderId: input.orderId,
          paymentId: input.paymentId,
          amountPaise: gp.amountPaise,
          method: gp.method ?? "CARD",
          raw: gp,
        },
        effects,
      );
      await tx.webhookEvent.update({ where: { id: fresh.id }, data: { processedAt: new Date() } });
    });
    for (const fx of effects) await fx().catch((err) => console.error("payment effect failed", err));
  }
  return { status: "paid", order: await db.paymentOrder.findUnique({ where: { id: order.id } }) };
}

function safeJson(raw: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}
