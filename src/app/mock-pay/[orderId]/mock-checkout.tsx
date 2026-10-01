"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { simulatePaymentForm } from "./actions";

const METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "netbanking", label: "Netbanking" },
] as const;

function OutcomeButton({
  outcome,
  testId,
  className,
  children,
}: {
  outcome: string;
  testId: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("outcome") === outcome;
  return (
    <button
      type="submit"
      name="outcome"
      value={outcome}
      disabled={pending}
      data-testid={testId}
      className={cn("rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-60", className)}
    >
      {mine ? "Processing…" : children}
    </button>
  );
}

/** Fake checkout. A plain <form> posting to a server action, so it works even before hydration. */
export function MockCheckout({ orderId }: { orderId: string }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("upi");
  return (
    <form action={simulatePaymentForm} className="mt-5">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="method" value={method} />
      <div role="tablist" aria-label="Payment method" className="flex gap-1 rounded-lg bg-[#eef1f6] p-1">
        {METHODS.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            aria-selected={method === m.id}
            onClick={() => setMethod(m.id)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium",
              method === m.id ? "bg-white shadow" : "text-[#5b6476]",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-5 space-y-3 text-sm">
        {method === "upi" && (
          <label className="block">
            <span className="text-[#5b6476]">UPI ID</span>
            <input
              readOnly
              value="parent@okmockbank"
              className="mt-1 h-10 w-full rounded-md border border-[#d5dae3] bg-[#f8f9fb] px-3 font-mono"
            />
          </label>
        )}
        {method === "card" && (
          <>
            <label className="block">
              <span className="text-[#5b6476]">Card number (test)</span>
              <input
                readOnly
                value="4111 1111 1111 1111"
                className="mt-1 h-10 w-full rounded-md border border-[#d5dae3] bg-[#f8f9fb] px-3 font-mono"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                readOnly
                aria-label="Expiry"
                value="12/30"
                className="h-10 rounded-md border border-[#d5dae3] bg-[#f8f9fb] px-3 font-mono"
              />
              <input
                readOnly
                aria-label="CVV"
                value="123"
                className="h-10 rounded-md border border-[#d5dae3] bg-[#f8f9fb] px-3 font-mono"
              />
            </div>
          </>
        )}
        {method === "netbanking" && (
          <label className="block">
            <span className="text-[#5b6476]">Bank</span>
            <select
              disabled
              className="mt-1 h-10 w-full rounded-md border border-[#d5dae3] bg-[#f8f9fb] px-3"
            >
              <option>Mock National Bank</option>
            </select>
          </label>
        )}
      </div>
      <p className="mt-6 text-xs font-semibold tracking-wider text-[#5b6476] uppercase">Simulate outcome</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <OutcomeButton
          outcome="success"
          testId="mock-succeed"
          className="bg-[#16794b] text-white hover:brightness-110"
        >
          Succeed
        </OutcomeButton>
        <OutcomeButton
          outcome="failure"
          testId="mock-fail"
          className="bg-[#b4342c] text-white hover:brightness-110"
        >
          Fail
        </OutcomeButton>
        <OutcomeButton
          outcome="pending"
          testId="mock-pending"
          className="border border-[#d5dae3] hover:bg-[#f3f5f8]"
        >
          Stay pending
        </OutcomeButton>
        <OutcomeButton
          outcome="duplicate"
          testId="mock-duplicate"
          className="border border-[#d5dae3] hover:bg-[#f3f5f8]"
        >
          Succeed + duplicate webhook
        </OutcomeButton>
      </div>
      <p className="mt-4 text-xs text-[#5b6476]">
        Each outcome posts an HMAC-signed webhook to /api/payments/webhook/mock, then returns you to the
        school site.
      </p>
    </form>
  );
}
