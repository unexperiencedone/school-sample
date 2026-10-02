"use client";

import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startCheckout } from "@/lib/checkout-client";
import { toPaise, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const PRESETS = [100_000, 200_000, 500_000];

/** Pocket-money top-up through the gateway; the idempotency key makes a double click open one order. */
export function TopUp({ studentId }: { studentId: string }) {
  const key = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
  );
  const [amount, setAmount] = useState<number>(200_000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = async () => {
    setError(null);
    let paise = amount;
    if (custom.trim()) {
      try {
        paise = toPaise(custom.replace(/,/g, ""));
      } catch {
        return setError("Enter an amount in rupees");
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payments/imprest-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, amountPaise: paise, idempotencyKey: `${key.current}:${paise}` }),
      });
      const body = (await res.json()) as {
        checkout?: Parameters<typeof startCheckout>[0];
        error?: { message: string; details?: { fieldErrors?: Record<string, string[]> } };
      };
      if (!res.ok || !body.checkout) {
        const field = body.error?.details?.fieldErrors?.amountPaise?.[0];
        throw new Error(field ?? body.error?.message ?? "Couldn't start the payment");
      }
      await startCheckout(body.checkout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed to start");
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Top-up amount" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={!custom && amount === p}
            onClick={() => {
              setAmount(p);
              setCustom("");
            }}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium tabular-nums",
              !custom && amount === p
                ? "border-primary bg-primary text-primary-fg"
                : "border-line hover:bg-sunken",
            )}
          >
            {formatINR(p)}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Or another amount (₹500 – ₹20,000)</span>
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          inputMode="decimal"
          className="max-w-40"
        />
      </label>
      <Button variant="accent" onClick={pay} disabled={busy}>
        <Lock className="size-3.5" aria-hidden /> {busy ? "Opening secure payment…" : "Top up"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
