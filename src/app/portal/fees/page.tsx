import Link from "next/link";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate, istDateOnly } from "@/lib/dates";
import type { BreakdownStep } from "@/lib/fee-engine";
import { selectChild } from "@/lib/services/portal";
import { PayButton } from "@/components/forms/pay-button";
import { FeeStatusBadge } from "@/components/crm/badges";
import { ChildHeader, NoChildren } from "@/components/portal/child-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fees" };

const METHOD: Record<string, string> = {
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  WALLET: "Wallet",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  DEMAND_DRAFT: "Demand draft",
  CASH: "Cash",
};

/** Every invoice for the child, what's due, a pay button per instalment, how it was calculated, and receipts. */
export default async function PortalFees({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireRole(["PARENT"]);
  const { child } = await selectChild(user, (await searchParams).child);
  if (!child) return <NoChildren />;
  const today = istDateOnly(new Date());
  const [invoices, payments, wallet] = await Promise.all([
    db.invoice.findMany({
      where: { studentId: child.id, status: { notIn: ["VOID", "DRAFT"] } },
      include: { year: true, plan: true, instalments: { orderBy: { seq: "asc" } } },
      orderBy: { issuedAt: "desc" },
    }),
    db.payment.findMany({
      where: { studentId: child.id, status: { not: "FAILED" } },
      include: { receipt: true },
      orderBy: { receivedAt: "desc" },
    }),
    db.walletEntry.aggregate({ where: { studentId: child.id }, _sum: { amountPaise: true } }),
  ]);
  const credit = wallet._sum.amountPaise ?? 0;
  return (
    <>
      <ChildHeader child={child} title="Fees" />
      {credit > 0 && (
        <p className="mb-6 rounded-md bg-success-bg px-4 py-3 text-sm text-success">
          You have {formatINR(credit)} in credit on account. It is applied automatically to the next
          instalment.
        </p>
      )}
      <div className="space-y-6">
        {invoices.map((inv) => {
          const balance = Math.max(0, inv.totalPaise + inv.lateFeePaise - inv.paidPaise);
          const steps = ((inv.breakdown ?? {}) as { steps?: BreakdownStep[] }).steps ?? [];
          let firstOpenShown = false;
          return (
            <section
              key={inv.id}
              aria-labelledby={`inv-${inv.id}`}
              className="rounded-xl border border-line bg-elevated"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
                <div>
                  <h2 id={`inv-${inv.id}`} className="font-serif text-xl">
                    {inv.year.name} fees
                  </h2>
                  <p className="text-sm text-muted">
                    {inv.number} · {inv.plan.name} · total {formatINR(inv.totalPaise)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <FeeStatusBadge status={inv.status} />
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-sm underline"
                  >
                    <Download className="size-4" aria-hidden /> Invoice
                  </a>
                </div>
              </header>
              <ul className="divide-y divide-line">
                {inv.instalments.map((i) => {
                  const late = i.lateFeeWaived ? 0 : i.lateFeePaise;
                  const owed = i.amountPaise + late - i.paidPaise;
                  const isNext = owed > 0 && !firstOpenShown;
                  if (isNext) firstOpenShown = true;
                  return (
                    <li
                      key={i.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 px-6 py-4",
                        isNext && "bg-sunken/60",
                      )}
                    >
                      <div>
                        <p className="font-medium">{i.label}</p>
                        <p className="text-sm text-muted">
                          Due {formatDate(i.dueDate, "d MMM yyyy")} · {formatINR(i.amountPaise)}
                          {late > 0 && <span className="text-danger"> + {formatINR(late)} late fee</span>}
                          {i.paidPaise > 0 && owed > 0 && ` · ${formatINR(i.paidPaise)} paid`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <FeeStatusBadge status={owed > 0 && i.dueDate < today ? "OVERDUE" : i.status} />
                        {owed > 0 && (
                          <PayButton
                            instalmentId={i.id}
                            label={`Pay ${formatINR(owed)}`}
                            variant={isNext ? "accent" : "outline"}
                            size="sm"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3 text-sm">
                <details>
                  <summary className="cursor-pointer underline">How this was calculated</summary>
                  <ol className="mt-3 max-w-xl space-y-1">
                    {steps.map((st, k) => (
                      <li key={k} className="flex justify-between gap-6">
                        <span>
                          {st.label} <span className="text-xs text-muted">{st.detail}</span>
                        </span>
                        <span className={cn("tabular-nums", st.amountPaise < 0 && "text-success")}>
                          {formatINR(st.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
                <span>
                  Balance <span className="font-semibold tabular-nums">{formatINR(balance)}</span>
                </span>
              </footer>
            </section>
          );
        })}
        {invoices.length === 0 && <p className="text-muted">No invoices yet.</p>}
      </div>

      <section aria-labelledby="receipts-h" className="mt-10">
        <h2 id="receipts-h" className="font-serif text-2xl">
          Payments and receipts
        </h2>
        {payments.length ? (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-elevated">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                <span>
                  <span className="font-medium tabular-nums">{formatINR(p.amountPaise)}</span>{" "}
                  <span className="text-muted">
                    · {METHOD[p.method] ?? p.method} · {formatDate(p.receivedAt, "d MMM yyyy")}
                    {p.refundedPaise > 0 && ` · ${formatINR(p.refundedPaise)} refunded`}
                  </span>
                </span>
                {p.receipt && (
                  <a
                    href={`/api/receipts/${p.receipt.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 underline"
                  >
                    <Download className="size-4" aria-hidden /> {p.receipt.number}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">No payments yet.</p>
        )}
        <p className="mt-4 text-sm text-muted">
          Questions about fees? See the{" "}
          <Link href="/admissions/fees/full-boarding" className="underline">
            published fee schedule and policies
          </Link>{" "}
          or write to the Accounts office from{" "}
          <Link href={`/portal/requests?child=${child.id}`} className="underline">
            Requests
          </Link>
          .
        </p>
      </section>
    </>
  );
}
