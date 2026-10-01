"use client";

import { useState } from "react";
import type { PublicFeeSchedule } from "@/lib/services/fee-data";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const BOARDING_LABEL = { FULL: "Full boarding", FLEXI: "Flexi boarding", DAY: "Day boarding" } as const;

type Column = PublicFeeSchedule["bands"][number]["columns"][number];

/** Union of fee lines across columns (e.g. day has no boarding line), keeping first-seen order. */
function rowsFor(columns: Column[]) {
  const rows = new Map<string, Column["lines"][number]>();
  for (const c of columns) for (const l of c.lines) if (!rows.has(l.code)) rows.set(l.code, l);
  const order = ["ADM", "TUI", "BRD", "ACT", "BKS", "EXM", "UNI", "TRN"];
  return [...rows.values()].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
}

/** Fee tables with an instalment-plan toggle. All figures come from the fee engine via the server. */
export function FeeTables({ schedule }: { schedule: PublicFeeSchedule }) {
  const [plan, setPlan] = useState(schedule.plans[schedule.plans.length - 1]?.code ?? "ONE");
  return (
    <div>
      <fieldset className="sticky top-20 z-10 -mx-4 mb-10 border-b border-line bg-paper/95 px-4 py-4 backdrop-blur">
        <legend className="sr-only">Show instalments for</legend>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-fg" aria-hidden>
            Pay in:
          </span>
          <div
            role="radiogroup"
            aria-label="Instalment plan"
            className="inline-flex rounded-full bg-cream p-1"
          >
            {schedule.plans.map((p) => (
              <label
                key={p.code}
                className={cn(
                  "cursor-pointer rounded-full px-4 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus",
                  plan === p.code ? "bg-damson-800 text-paper" : "text-slate hover:text-fg",
                )}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.code}
                  checked={plan === p.code}
                  onChange={() => setPlan(p.code)}
                  className="sr-only"
                />
                {p.code === "ONE" ? "1 payment" : p.code === "TWO" ? "2 instalments" : "3 instalments"}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="space-y-16">
        {schedule.bands.map((band) => (
          <section key={band.band} aria-labelledby={`band-${band.band}`}>
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`band-${band.band}`} className="font-serif text-3xl text-primary">
                {band.label}
              </h2>
              <p className="text-sm text-muted">{band.years}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-elevated">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">
                  {band.label} fees for {schedule.year.name}, per year, in Indian rupees
                </caption>
                <thead>
                  <tr className="border-b border-line bg-cream/70 text-left">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Fee
                    </th>
                    {band.columns.map((c) => (
                      <th key={c.boarding} scope="col" className="px-5 py-3 text-right font-semibold">
                        {BOARDING_LABEL[c.boarding]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(band.columns).map((line) => (
                    <tr key={line.code} className="border-b border-line/70">
                      <th scope="row" className="px-5 py-3 text-left font-normal">
                        {line.name}
                        <span className="ml-2 text-xs text-muted">
                          {line.oneTime ? "one-time, new pupils" : "per year"}
                        </span>
                        {!line.refundable && (
                          <span className="ml-1 text-xs text-muted">· non-refundable</span>
                        )}
                      </th>
                      {band.columns.map((c) => {
                        const l = c.lines.find((x) => x.code === line.code);
                        return (
                          <td key={c.boarding} className="px-5 py-3 text-right tabular-nums">
                            {l ? formatINR(l.amountPaise) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-b border-line">
                    <th scope="row" className="px-5 py-3 text-left font-semibold">
                      Annual fees (continuing pupils)
                    </th>
                    {band.columns.map((c) => (
                      <td key={c.boarding} className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatINR(c.annualPaise)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-damson-50">
                    <th scope="row" className="px-5 py-3 text-left font-semibold text-damson-800">
                      First year, new pupils
                    </th>
                    {band.columns.map((c) => (
                      <td
                        key={c.boarding}
                        className="px-5 py-3 text-right font-semibold text-damson-800 tabular-nums"
                      >
                        {formatINR(c.firstYearPaise)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {band.columns.map((c) => (
                <div key={c.boarding} className="rounded-lg border border-dashed border-line-strong p-4">
                  <p className="text-xs font-semibold tracking-wider text-kiln-700 uppercase">
                    {BOARDING_LABEL[c.boarding]} · first year
                  </p>
                  <ol className="mt-3 space-y-1.5 text-sm">
                    {c.plans[plan]!.instalments.map((i) => (
                      <li key={i.label} className="flex justify-between gap-4">
                        <span>
                          {i.label}{" "}
                          <span className="text-muted">· due {formatDate(i.dueDate, "d MMM yyyy")}</span>
                        </span>
                        <span className="font-medium tabular-nums">{formatINR(i.amountPaise)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
