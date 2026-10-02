import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Megaphone, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate, istDateOnly } from "@/lib/dates";
import { selectChild } from "@/lib/services/portal";
import { balances } from "@/lib/services/imprest";
import { PayButton } from "@/components/forms/pay-button";
import { ChildHeader, NoChildren } from "@/components/portal/child-card";

export const metadata = { title: "Overview" };

/** What a parent needs at a glance: what's due, pocket money, the latest from school and anything waiting on them. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireRole(["PARENT"]);
  const { child, guardian } = await selectChild(user, (await searchParams).child);
  if (!child) return <NoChildren />;
  const today = istDateOnly(new Date());
  const [instalments, circulars, events, requests, bal] = await Promise.all([
    db.instalment.findMany({
      where: {
        invoice: { studentId: child.id, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
        status: { notIn: ["PAID", "WAIVED"] },
      },
      include: { invoice: { select: { number: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.announcement.findMany({
      where: { kind: "CIRCULAR", active: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
    db.event.findMany({
      where: { published: true, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 3,
    }),
    db.portalRequest.findMany({
      where: { studentId: child.id, status: { in: ["OPEN", "IN_REVIEW"] } },
      orderBy: { createdAt: "desc" },
    }),
    child.boardingType === "DAY" ? Promise.resolve(null) : balances([child.id]),
  ]);
  const open = instalments
    .map((i) => ({ ...i, owed: i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise }))
    .filter((i) => i.owed > 0);
  const next = open[0];
  const overdue = open.filter((i) => i.dueDate < today);
  const total = open.reduce((a, i) => a + i.owed, 0);
  const pocket = bal?.get(child.id)?.balance ?? null;
  const q = `?child=${child.id}`;
  return (
    <>
      <p className="mb-2 text-sm text-muted">Hello{guardian ? `, ${guardian.name.split(" ")[0]}` : ""}</p>
      <ChildHeader child={child} title="Overview" />
      <div className="grid gap-5 lg:grid-cols-3">
        <section
          aria-labelledby="fees-h"
          className="rounded-xl border border-line bg-elevated p-6 lg:col-span-2"
        >
          <h2 id="fees-h" className="font-serif text-xl">
            Fees
          </h2>
          {next ? (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted">
                  {next.dueDate < today ? "Overdue since" : "Next due"}{" "}
                  {formatDate(next.dueDate, "d MMMM yyyy")}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{formatINR(next.owed)}</p>
                <p className="mt-1 text-sm text-muted">
                  {next.label} · {next.invoice.number}
                </p>
                {overdue.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger">
                    <AlertTriangle className="size-4" aria-hidden /> {overdue.length} overdue{" "}
                    {overdue.length === 1 ? "instalment" : "instalments"} — late fees apply
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <PayButton instalmentId={next.id} label={`Pay ${formatINR(next.owed)}`} variant="accent" />
                <Link href={`/portal/fees${q}`} className="text-sm underline">
                  All fees ({formatINR(total)} outstanding)
                </Link>
              </div>
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" aria-hidden /> All paid up — thank you.
              <Link href={`/portal/fees${q}`} className="ml-2 text-sm text-fg underline">
                Receipts
              </Link>
            </p>
          )}
        </section>
        {pocket !== null ? (
          <section aria-labelledby="pm-h" className="rounded-xl border border-line bg-elevated p-6">
            <h2 id="pm-h" className="flex items-center gap-2 font-serif text-xl">
              <Wallet className="size-5 text-muted" aria-hidden /> Pocket money
            </h2>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{formatINR(pocket)}</p>
            <Link
              href={`/portal/pocket-money${q}`}
              className="mt-3 inline-flex items-center gap-1 text-sm underline"
            >
              Top up or see spending <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </section>
        ) : (
          <section aria-labelledby="req-h" className="rounded-xl border border-line bg-elevated p-6">
            <h2 id="req-h" className="font-serif text-xl">
              Requests
            </h2>
            <p className="mt-4 text-sm text-muted">
              {requests.length ? `${requests.length} awaiting the school's reply.` : "Nothing waiting."}
            </p>
            <Link
              href={`/portal/requests${q}`}
              className="mt-3 inline-flex items-center gap-1 text-sm underline"
            >
              Requests <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </section>
        )}
        <section
          aria-labelledby="circ-h"
          className="rounded-xl border border-line bg-elevated p-6 lg:col-span-2"
        >
          <h2 id="circ-h" className="flex items-center gap-2 font-serif text-xl">
            <Megaphone className="size-5 text-muted" aria-hidden /> From the school
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {circulars.map((c) => (
              <li key={c.id} className="py-3">
                <Link href={`/portal/circulars${q}#${c.id}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <p className="text-sm text-muted">
                  {formatDate(c.publishedAt, "d MMMM")} · {c.body.slice(0, 120)}…
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="ev-h" className="rounded-xl border border-line bg-elevated p-6">
          <h2 id="ev-h" className="flex items-center gap-2 font-serif text-xl">
            <CalendarDays className="size-5 text-muted" aria-hidden /> Coming up
          </h2>
          <ul className="mt-4 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="font-medium">{e.title}</span>
                <span className="block text-muted">{formatDate(e.startsAt, "EEE d MMM, h:mm a")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
