import { notFound } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { school } from "@/config/school";
import { MockCheckout } from "./mock-checkout";

export const metadata = { title: "Mock payment gateway", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A realistic fake gateway screen for the demo. Only exists when PAYMENT_PROVIDER=mock. */
export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== "mock") notFound();
  const order = await db.paymentOrder.findUnique({ where: { providerOrderId: orderId } });
  if (!order) notFound();
  const notes = (order.notes ?? {}) as { description?: string };
  const customer = order.customer as { name?: string; email?: string };
  return (
    <div className="min-h-dvh bg-[#eef1f6] px-4 py-10 font-sans text-[#1b2333]">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          <strong>Mock gateway</strong> — no real money moves. Choose an outcome to see how the school system
          reacts.
        </p>
        <div className="grid overflow-hidden rounded-xl bg-white shadow-xl md:grid-cols-[1fr_1.4fr]">
          <aside className="bg-[#1d2a44] p-7 text-white">
            <p className="text-xs tracking-widest text-white/60 uppercase">Paying</p>
            <p className="mt-1 font-semibold">{school.name}</p>
            <p className="mt-6 text-xs tracking-widest text-white/60 uppercase">Amount</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatINR(order.amountPaise, { alwaysDecimals: true })}
            </p>
            <p className="mt-6 text-sm text-white/80">{notes.description}</p>
            <dl className="mt-6 space-y-2 text-xs text-white/70">
              <div>
                <dt className="inline">Order: </dt>
                <dd className="inline font-mono">{order.providerOrderId}</dd>
              </div>
              <div>
                <dt className="inline">Payer: </dt>
                <dd className="inline">
                  {customer.name} · {customer.email}
                </dd>
              </div>
              <div>
                <dt className="inline">Status: </dt>
                <dd className="inline">{order.status}</dd>
              </div>
            </dl>
            <p className="mt-10 flex items-center gap-2 text-xs text-white/60">
              <Lock className="size-3.5" aria-hidden /> Secured by MockPay (demo)
            </p>
          </aside>
          <main id="main" className="p-7">
            <h1 className="text-lg font-semibold">Choose a payment method</h1>
            {order.status === "PAID" ? (
              <p className="mt-6 flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
                <ShieldCheck className="size-4" aria-hidden /> This order has already been paid.
              </p>
            ) : (
              <MockCheckout orderId={order.providerOrderId} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
