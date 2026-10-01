"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatINR, paiseToRupeeString } from "@/lib/money";
import { refundQuoteAction, requestRefundAction } from "../../actions";

type Student = { id: string; label: string; group: string };
type Pay = { id: string; label: string; availablePaise: number };
type Quote = Awaited<ReturnType<typeof refundQuoteAction>>;

export function RefundForm({
  students,
  studentId,
  payments,
  defaultPayment,
  today,
}: {
  students: Student[];
  studentId: string | null;
  payments: Pay[];
  defaultPayment: string | null;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [clientKey] = useState(() => crypto.randomUUID());
  const [paymentId, setPaymentId] = useState(defaultPayment ?? payments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [withdrawal, setWithdrawal] = useState(today);
  const [notice, setNotice] = useState("90");
  const [quote, setQuote] = useState<Quote | null>(null);
  const chosen = payments.find((p) => p.id === paymentId);
  const groups = [...new Set(students.map((s) => s.group))];

  return (
    <div className="space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Pupil</span>
        <Select
          value={studentId ?? ""}
          onChange={(e) => router.replace(`${pathname}?student=${e.target.value}`)}
        >
          <option value="" disabled>
            Choose a pupil…
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {students
                .filter((s) => s.group === g)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </label>

      {studentId && (
        <section className="rounded-md bg-sunken p-4" aria-labelledby="quote-title">
          <h2 id="quote-title" className="text-sm font-semibold">
            Withdrawal quote (refund policy)
          </h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">Last day at school</span>
              <Input type="date" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">Written notice given (days)</span>
              <Input value={notice} onChange={(e) => setNotice(e.target.value)} inputMode="numeric" />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () =>
                    setQuote(await refundQuoteAction(studentId, withdrawal, Number(notice) || 0)),
                  )
                }
              >
                Calculate
              </Button>
            </div>
          </div>
          {quote && (
            <div className="mt-3 text-sm" aria-live="polite">
              <ul className="space-y-0.5">
                {quote.lines.map((l) => (
                  <li key={l.headCode} className="flex justify-between gap-3">
                    <span>
                      {l.name} <span className="text-xs text-muted">({l.reason})</span>
                    </span>
                    <span className="tabular-nums">
                      {formatINR(l.refundPaise)}{" "}
                      <span className="text-xs text-muted">of {formatINR(l.paidPaise)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {quote.notes.map((n) => (
                <p key={n} className="mt-1 text-xs text-muted">
                  {n}
                </p>
              ))}
              <p className="mt-2 flex items-center justify-between font-semibold">
                <span>Refundable under the policy ({quote.yearName})</span>
                <span className="tabular-nums">{formatINR(quote.refundablePaise)}</span>
              </p>
              <button
                type="button"
                className="mt-1 text-xs text-primary underline"
                onClick={() =>
                  setAmount(
                    paiseToRupeeString(
                      Math.min(quote.refundablePaise, chosen?.availablePaise ?? quote.refundablePaise),
                    ),
                  )
                }
              >
                Use this amount
              </button>
            </div>
          )}
        </section>
      )}

      {studentId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await requestRefundAction(fd);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message);
              router.push("/admin/payments/refunds?status=REQUESTED");
            });
          }}
          className="space-y-4"
        >
          <input type="hidden" name="clientKey" value={clientKey} />
          <input
            type="hidden"
            name="policy"
            value={
              quote
                ? JSON.stringify({
                    refundablePaise: quote.refundablePaise,
                    lines: quote.lines,
                    notes: quote.notes,
                    withdrawal,
                    noticeDays: notice,
                  })
                : ""
            }
          />
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Refund from payment</legend>
            {payments.length ? (
              <div className="space-y-1.5">
                {payments.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-sunken"
                  >
                    <input
                      type="radio"
                      name="paymentId"
                      value={p.id}
                      checked={paymentId === p.id}
                      onChange={() => setPaymentId(p.id)}
                      className="size-4"
                    />
                    <span className="flex-1">{p.label}</span>
                    <span className="text-xs text-muted">up to {formatINR(p.availablePaise)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No refundable payments for this pupil.</p>
            )}
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Amount (₹)</span>
            <Input
              name="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Reason</span>
            <Textarea
              name="reason"
              rows={2}
              required
              minLength={5}
              placeholder="e.g. Withdrawn on relocation; notice received 2 Sep"
            />
          </label>
          <Button type="submit" disabled={pending || !payments.length}>
            Request approval
          </Button>
        </form>
      )}
    </div>
  );
}
