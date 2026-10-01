"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Polls order status for a minute while a payment is pending (webhooks can lag behind the redirect). */
export function PaymentTracker({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 12) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/payments/status?order=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { status?: string };
      if (body.status === "PAID") router.refresh();
      else setTries((n) => n + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [tries, orderId, router]);
  return (
    <p className="mt-4 text-sm text-muted" role="status">
      {tries < 12
        ? "We're waiting for confirmation from the bank. This page will update automatically."
        : "Still pending. We'll email you as soon as the bank confirms; you don't need to pay again."}
    </p>
  );
}
