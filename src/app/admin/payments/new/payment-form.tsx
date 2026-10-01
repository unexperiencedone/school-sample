"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatINR, paiseToRupeeString } from "@/lib/money";
import { previewAllocationAction, recordPaymentAction } from "../actions";

type Student = { id: string; label: string; group: string };
type Inst = { id: string; label: string; outstandingPaise: number; overdue: boolean };
type Preview = Awaited<ReturnType<typeof previewAllocationAction>>;

const METHODS = [
  ["BANK_TRANSFER", "Bank transfer (NEFT/RTGS/IMPS)"],
  ["CHEQUE", "Cheque"],
  ["DEMAND_DRAFT", "Demand draft"],
  ["CASH", "Cash"],
] as const;

/**
 * Offline payment entry. Choosing a pupil reloads their open instalments; the allocation preview is computed by
 * the same engine the ledger uses. A per-form idempotency key means a double submit records once.
 */
export function PaymentForm({
  students,
  studentId,
  instalments,
  defaultInstalment,
  today,
}: {
  students: Student[];
  studentId: string | null;
  instalments: Inst[];
  defaultInstalment: string | null;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [instalmentId, setInstalmentId] = useState(defaultInstalment ?? "");
  const target = instalments.find((i) => i.id === instalmentId);
  const totalDue = instalments.reduce((a, i) => a + i.outstandingPaise, 0);
  const [amount, setAmount] = useState(() => (target ? paiseToRupeeString(target.outstandingPaise) : ""));
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [preview, setPreview] = useState<Preview>(null);
  const [done, setDone] = useState<{ receiptId?: string; message: string } | null>(null);

  useEffect(() => {
    if (!studentId || !amount) return setPreview(null);
    const t = setTimeout(
      async () => setPreview(await previewAllocationAction(studentId, amount, instalmentId || null)),
      250,
    );
    return () => clearTimeout(t);
  }, [studentId, amount, instalmentId]);

  if (done)
    return (
      <div role="status" className="space-y-3 rounded-lg border border-line bg-success-bg p-5">
        <p className="font-medium text-success">{done.message}</p>
        <div className="flex flex-wrap gap-2">
          {done.receiptId && (
            <a
              href={`/api/receipts/${done.receiptId}`}
              target="_blank"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg"
            >
              Open receipt (PDF)
            </a>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setClientKey(crypto.randomUUID());
              setAmount("");
              router.refresh();
            }}
          >
            Record another
          </Button>
          <Link href="/admin/payments" className="inline-flex h-9 items-center px-3 text-sm underline">
            All payments
          </Link>
        </div>
      </div>
    );

  const groups = [...new Set(students.map((s) => s.group))];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await recordPaymentAction(fd);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          setDone({ receiptId: r.id, message: r.message ?? "Recorded" });
        });
      }}
      className="space-y-4"
    >
      <input type="hidden" name="clientKey" value={clientKey} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Pupil</span>
        <Select
          name="studentId"
          value={studentId ?? ""}
          required
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
        <>
          <p className="text-sm text-muted">
            {instalments.length
              ? `${instalments.length} open ${instalments.length === 1 ? "instalment" : "instalments"} · ${formatINR(totalDue)} outstanding`
              : "Nothing outstanding — a payment will be held as credit on account."}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Apply to</span>
            <Select
              name="instalmentId"
              value={instalmentId}
              onChange={(e) => setInstalmentId(e.target.value)}
            >
              <option value="">Oldest due first (recommended)</option>
              {instalments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label} — {formatINR(i.outstandingPaise)}
                  {i.overdue ? " (overdue)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Amount received (₹)</span>
              <Input
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                required
              />
              <span className="mt-1 flex gap-3 text-xs">
                {target && (
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setAmount(paiseToRupeeString(target.outstandingPaise))}
                  >
                    This instalment
                  </button>
                )}
                {totalDue > 0 && (
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setAmount(paiseToRupeeString(totalDue))}
                  >
                    Everything outstanding
                  </button>
                )}
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Date received</span>
              <Input type="date" name="receivedAt" defaultValue={today} max={today} required />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Method</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {METHODS.map(([v, l]) => (
                <label
                  key={v}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-sunken"
                >
                  <input
                    type="radio"
                    name="method"
                    value={v}
                    checked={method === v}
                    onChange={() => setMethod(v)}
                    className="size-4"
                  />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          {method !== "CASH" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {method === "CHEQUE"
                  ? "Cheque number and bank"
                  : method === "DEMAND_DRAFT"
                    ? "DD number"
                    : "UTR / bank reference"}
              </span>
              <Input
                name="reference"
                required
                placeholder={method === "BANK_TRANSFER" ? "e.g. NEFT400037" : ""}
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes (optional)</span>
            <Textarea name="notes" rows={2} />
          </label>
          {preview && (
            <div className="rounded-md bg-sunken p-3 text-sm" aria-live="polite">
              <p className="mb-1 font-medium">This payment will be applied to</p>
              <ul className="space-y-0.5">
                {preview.lines.map((l) => (
                  <li key={l.instalmentId} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="tabular-nums">{formatINR(l.amountPaise)}</span>
                  </li>
                ))}
                {preview.walletCreditPaise > 0 && (
                  <li className="flex justify-between gap-3 text-success">
                    <span>Held as credit on account</span>
                    <span className="tabular-nums">{formatINR(preview.walletCreditPaise)}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Recording…" : "Record payment and issue receipt"}
          </Button>
        </>
      )}
    </form>
  );
}
