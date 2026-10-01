import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { verifyReturn } from "@/lib/services/payments";
import { formatINR } from "@/lib/money";
import { PaymentTracker } from "./payment-tracker";

export const metadata = { title: "Payment status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = {
  order_id?: string;
  payment_id?: string;
  signature?: string;
  status?: string;
  ref?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

/** Gateway return page. Verifies the signature (and reconciles if the webhook is late), then shows the outcome. */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const orderId = sp.order_id ?? sp.razorpay_order_id;
  const paymentId = sp.payment_id ?? sp.razorpay_payment_id;
  const signature = sp.signature ?? sp.razorpay_signature;
  let order = orderId
    ? await db.paymentOrder.findUnique({ where: { providerOrderId: orderId } })
    : sp.ref
      ? await db.paymentOrder.findUnique({ where: { idempotencyKey: sp.ref } })
      : null;
  let state: "paid" | "pending" | "failed" =
    order?.status === "PAID" ? "paid" : sp.status === "failure" ? "failed" : "pending";
  if (order && state !== "paid" && orderId && paymentId && signature) {
    const v = await verifyReturn({ orderId, paymentId, signature });
    state = v.status;
    order = v.order ?? order;
  }
  const notes = (order?.notes ?? {}) as { description?: string; returnPath?: string };
  const back = notes.returnPath ?? "/";
  const receipt = order ? await db.receipt.findFirst({ where: { payment: { orderId: order.id } } }) : null;
  const Icon = state === "paid" ? CheckCircle2 : state === "failed" ? XCircle : Clock;

  return (
    <section className="container-prose grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <Icon
          className={`mx-auto size-14 ${state === "paid" ? "text-success" : state === "failed" ? "text-danger" : "text-warning"}`}
          aria-hidden
        />
        <h1 className="t-h1 mt-4 text-primary">
          {state === "paid"
            ? "Payment received"
            : state === "failed"
              ? "Payment didn't go through"
              : "Payment pending"}
        </h1>
        {order && (
          <p className="mt-3 text-muted">
            {notes.description} · {formatINR(order.amountPaise)}
          </p>
        )}
        {receipt && (
          <p className="mt-2 text-sm">
            Receipt <span className="font-mono font-semibold">{receipt.number}</span> has been emailed to you.
          </p>
        )}
        {state === "failed" && (
          <p className="mt-4 text-sm text-muted">
            No money has been taken. You can try again — the same order will be reused, so you can never be
            charged twice.
          </p>
        )}
        {state === "pending" && order && <PaymentTracker orderId={order.providerOrderId} />}
        <div className="mt-8 flex justify-center gap-3">
          <Link href={back} className="rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper">
            {state === "failed" ? "Back and try again" : "Continue"}
          </Link>
        </div>
      </div>
    </section>
  );
}
