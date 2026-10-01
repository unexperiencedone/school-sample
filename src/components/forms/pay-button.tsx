"use client";

import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { startCheckout } from "@/lib/checkout-client";
import { track } from "@/lib/analytics";

/**
 * Starts a fee payment. A per-mount idempotency key means double clicks (or a retry after a failed payment)
 * reuse the same gateway order instead of creating a second one.
 */
export function PayButton({
  invoiceId,
  instalmentId,
  amountPaise,
  label,
  ...props
}: { invoiceId?: string; instalmentId?: string; amountPaise?: number; label: string } & Omit<
  ButtonProps,
  "onClick"
>) {
  const key = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        disabled={busy || props.disabled}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/payments/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invoiceId, instalmentId, amountPaise, idempotencyKey: key.current }),
            });
            const body = (await res.json()) as {
              checkout?: Parameters<typeof startCheckout>[0];
              error?: { message: string };
            };
            if (!res.ok || !body.checkout)
              throw new Error(body.error?.message ?? "Couldn't start the payment");
            track("payment_start", { purpose: instalmentId ? "instalment" : "invoice" });
            await startCheckout(body.checkout);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Payment failed to start");
            setBusy(false);
          }
        }}
      >
        <Lock className="size-3.5" aria-hidden /> {busy ? "Opening secure payment…" : label}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
