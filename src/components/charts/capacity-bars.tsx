"use client";

import { AlertTriangle } from "lucide-react";
import { TipLine, TipTitle, useChartTooltip } from "./tooltip";

export type CapacityRow = {
  key: string;
  label: string;
  capacity: number;
  enrolled: number;
  offered: number;
  waitlist: number;
  left: number;
};

/**
 * One bar per class on a shared scale: the track is the class's capacity, enrolled pupils (slot 1) and open
 * offers (slot 2) fill it from the left, and a class that overflows its capacity runs past the capacity mark.
 * The status is always written out ("Over by 3", "Full", "4 left"), with an icon for the over-capacity case, so
 * colour is never the only channel.
 */
export function CapacityBars({ rows, ariaLabel }: { rows: CapacityRow[]; ariaLabel: string }) {
  const tt = useChartTooltip();
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.capacity, r.enrolled + r.offered)));
  const pct = (n: number) => `${(n / scale) * 100}%`;
  return (
    <div ref={tt.ref} className="relative" onMouseLeave={tt.hide}>
      <ul aria-label={ariaLabel} className="space-y-0.5">
        {rows.map((r) => {
          const over = r.left < 0;
          const status = over ? `Over by ${-r.left}` : r.left === 0 ? "Full" : `${r.left} left`;
          const summary = `${r.label}: ${r.enrolled} enrolled, ${r.offered} open offers, ${r.waitlist} waitlisted, capacity ${r.capacity}, ${status}`;
          const content = (
            <>
              <TipTitle>
                {r.label} · {r.capacity} places
              </TipTitle>
              <TipLine>
                Enrolled {r.enrolled} · Open offers {r.offered}
              </TipLine>
              <TipLine>
                Waitlist {r.waitlist} · {status}
              </TipLine>
            </>
          );
          return (
            <li key={r.key}>
              <div
                tabIndex={0}
                aria-label={summary}
                onMouseMove={tt.onPointer(content)}
                onFocus={tt.onFocus(content)}
                onBlur={tt.hide}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-md px-1.5 py-1.5 outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="truncate text-sm text-fg">{r.label}</span>
                <span className="relative block h-3.5" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-[4px]"
                    style={{ width: pct(r.capacity), background: "var(--viz-track)" }}
                  />
                  <span className="absolute inset-0 flex gap-[2px]">
                    {r.enrolled > 0 && (
                      <span
                        className={r.offered ? "" : "rounded-r-[4px]"}
                        style={{ width: pct(r.enrolled), background: "var(--viz-1)" }}
                      />
                    )}
                    {r.offered > 0 && (
                      <span
                        className="rounded-r-[4px]"
                        style={{ width: pct(r.offered), background: "var(--viz-2)" }}
                      />
                    )}
                  </span>
                  <span
                    className="absolute inset-y-[-2px] w-px bg-line-strong"
                    style={{ left: pct(r.capacity) }}
                  />
                </span>
                <span
                  className={`flex items-center justify-end gap-1 text-right text-sm tabular-nums ${over ? "font-semibold text-danger" : r.left === 0 ? "font-semibold text-fg" : "text-muted"}`}
                >
                  {over && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                  {status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {tt.node}
    </div>
  );
}
