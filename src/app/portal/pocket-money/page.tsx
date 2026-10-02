import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate, istDateOnly } from "@/lib/dates";
import { IMPREST_CATEGORIES, ledger } from "@/lib/services/imprest";
import { selectChild } from "@/lib/services/portal";
import { ChildHeader, NoChildren } from "@/components/portal/child-card";
import { TopUp } from "@/components/portal/top-up";

export const metadata = { title: "Pocket money" };

export default async function PocketMoney({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireRole(["PARENT"]);
  const { child } = await selectChild(user, (await searchParams).child);
  if (!child) return <NoChildren />;
  if (child.boardingType === "DAY")
    return (
      <>
        <ChildHeader child={child} title="Pocket money" />
        <p className="text-muted">
          Pocket money is kept for boarders. Day pupils don&apos;t need an account.
        </p>
      </>
    );
  const today = istDateOnly(new Date());
  const [rows, year, term] = await Promise.all([
    ledger(child.id),
    db.academicYear.findFirstOrThrow({ where: { isCurrent: true }, include: { imprestPolicies: true } }),
    db.term.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } } }),
  ]);
  const balance = rows.at(-1)?.balance ?? 0;
  const allowance =
    year.imprestPolicies.find((p) => p.boardingType === child.boardingType)?.amountPerTermPaise ?? 0;
  const spentThisTerm = rows
    .filter((r) => r.kind === "EXPENSE" && term && r.term?.name === term.name)
    .reduce((a, r) => a + r.amountPaise, 0);
  return (
    <>
      <ChildHeader child={child} title="Pocket money" />
      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-labelledby="bal-h" className="space-y-5 rounded-xl border border-line bg-elevated p-6">
          <div>
            <h2 id="bal-h" className="text-sm text-muted">
              Balance
            </h2>
            <p className="mt-1 text-4xl font-semibold tabular-nums">{formatINR(balance)}</p>
            <p className="mt-2 text-sm text-muted">
              Termly allowance {formatINR(allowance)} · spent this term {formatINR(spentThisTerm)}
            </p>
          </div>
          {child.onRoll && <TopUp key={child.id} studentId={child.id} />}
          <p className="text-xs text-muted">
            Top-ups show here within a minute of payment, with a receipt in Fees › Payments.
          </p>
        </section>
        <section aria-labelledby="led-h" className="rounded-xl border border-line bg-elevated">
          <h2 id="led-h" className="border-b border-line px-6 py-4 font-serif text-xl">
            Recent activity
          </h2>
          <ul className="divide-y divide-line">
            {[...rows]
              .reverse()
              .slice(0, 40)
              .map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                  <span>
                    {e.description}
                    <span className="block text-xs text-muted">
                      {formatDate(e.createdAt, "d MMM")} ·{" "}
                      {IMPREST_CATEGORIES[e.category as keyof typeof IMPREST_CATEGORIES] ?? e.category}
                    </span>
                  </span>
                  <span className={`tabular-nums ${e.kind === "CREDIT" ? "text-success" : ""}`}>
                    {e.kind === "CREDIT" ? "+" : "−"}
                    {formatINR(e.amountPaise)}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </>
  );
}
