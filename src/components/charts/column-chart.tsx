"use client";

import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TipLine, TipTitle, useChartTooltip } from "./tooltip";

export type Column = { key: string; label: string; value: number; display: string; detail: string };

/** "Nice" axis ticks from zero: steps of 1, 2, 2.5 or 5 × 10ⁿ, about four gridlines. */
export function niceTicks(max: number, integer: boolean, target = 4): number[] {
  if (max <= 0) return [0, integer ? 1 : 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t));
  return ticks;
}

/**
 * Vertical columns over time, one series. Bars ≤24px with a 4px rounded top on a solid baseline, hairline
 * gridlines, one direct label on the peak; every column is a full-height hover/focus target with a tooltip.
 * The fixed height includes the x-axis band, so the card never scrolls internally.
 */
export function ColumnChart({
  data,
  valueKind,
  ariaLabel,
  height = 220,
}: {
  data: Column[];
  valueKind: "count" | "inr";
  ariaLabel: string;
  height?: number;
}) {
  const tt = useChartTooltip();
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max, valueKind === "count");
  const top = ticks.at(-1)!;
  const fmt = (v: number) =>
    valueKind === "inr" ? (v === 0 ? "₹0" : formatINR(v, { compact: true })) : String(v);
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const dense = data.length > 8;

  return (
    <div ref={tt.ref} className="relative" style={{ height }} onMouseLeave={tt.hide}>
      <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
        <div className={cn("relative", valueKind === "inr" ? "w-14" : "w-8")} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 translate-y-1/2 text-[11px] whitespace-nowrap text-muted tabular-nums"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative">
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute inset-x-0 h-px bg-line"
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
          <ul aria-label={ariaLabel} className="absolute inset-0 flex">
            {data.map((d, i) => {
              const content = (
                <>
                  <TipTitle>{d.display}</TipTitle>
                  <TipLine>{d.detail}</TipLine>
                </>
              );
              return (
                <li key={d.key} className="flex h-full min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={`${d.detail}: ${d.display}`}
                    onMouseMove={tt.onPointer(content)}
                    onFocus={tt.onFocus(content)}
                    onBlur={tt.hide}
                    className="group relative flex h-full w-full cursor-default items-end justify-center px-[3px] outline-none hover:bg-sunken/70 focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {d.value > 0 && (
                      <span
                        className="relative block w-full max-w-6 rounded-t-[4px]"
                        style={{ height: `${(d.value / top) * 100}%`, background: "var(--viz-1)" }}
                      >
                        {i === peak && (
                          <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap text-fg tabular-nums">
                            {fmt(d.value)}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div />
        <div className="flex h-5 pt-1.5" aria-hidden>
          {data.map((d, i) => (
            // Labels centre on their column and may spill into the neighbour, which is why dense charts drop
            // every other label on phones.
            <span
              key={d.key}
              className={cn("relative min-w-0 flex-1", dense && i % 2 === 1 && "max-sm:invisible")}
            >
              <span className="absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted">
                {d.label}
              </span>
            </span>
          ))}
        </div>
      </div>
      {tt.node}
    </div>
  );
}
