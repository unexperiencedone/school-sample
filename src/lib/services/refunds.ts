import "server-only";
import type { Tx } from "@/lib/db";
import type { WebhookEvent } from "@/integrations/payments";
import type { Effect } from "./payments";

/** Gateway confirmed a refund: mark it processed and update the payment's refunded total (idempotent). */
export async function onRefundProcessed(
  tx: Tx,
  e: Extract<WebhookEvent, { type: "refund.processed" }>,
): Promise<Effect[]> {
  const refund =
    (await tx.refund.findFirst({ where: { providerRefundId: e.refundId } })) ??
    (await tx.refund.findFirst({
      where: { payment: { providerPaymentId: e.paymentId }, status: "APPROVED", amountPaise: e.amountPaise },
      orderBy: { createdAt: "asc" },
    }));
  if (!refund || refund.status === "PROCESSED" || refund.status === "CLOSED") return [];
  await tx.refund.update({
    where: { id: refund.id },
    data: { status: "PROCESSED", providerRefundId: e.refundId, processedAt: new Date() },
  });
  const payment = await tx.payment.update({
    where: { id: refund.paymentId },
    data: { refundedPaise: { increment: refund.amountPaise } },
  });
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: payment.refundedPaise >= payment.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });
  return [];
}
