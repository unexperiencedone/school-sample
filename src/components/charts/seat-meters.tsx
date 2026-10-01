"use client";

import { TipLine, TipTitle, useChartTooltip } from "./tooltip";

export type SeatMeterRow = {
  key: string;
  label: string;
  capacity: number;
  continuing: number;
  confirmed: number;
  offered: number;
  free: number;
};

/**
 * One stacked meter per class: places taken (slot 1), offers still open (slot 2), and the free remainder as the
 * track. Segments are separated by a 2px surface gap; the free count is always written out, so colour is never
 * the only channel.
 */
export function SeatMeters({ rows, ariaLabel }: { rows: SeatMeterRow[]; ariaLabel: string }) {
  const tt = useChartTooltip();
  return (
    <div ref={tt.ref} className="relative" onMouseLeave={tt.hide}>
      <ul aria-label={ariaLabel} className="grid gap-x-8 gap-y-0.5 md:grid-cols-2">
        {rows.map((r) => {
          const taken = r.continuing + r.confirmed;
          const over = Math.max(0, taken + r.offered - r.capacity);
          const pct = (n: number) => (r.capacity ? Math.min(100, (n / r.capacity) * 100) : 0);
          const status = over ? `Over by ${over}` : r.free === 0 ? "Full" : `${r.free} free`;
          const summary = `${r.label}: ${taken} taken (${r.continuing} moving up, ${r.confirmed} new), ${r.offered} offers out, ${status} of ${r.capacity}`;
          const content = (
            <>
              <TipTitle>
                {r.label} · {r.capacity} places
              </TipTitle>
              <TipLine>
                Moving up {r.continuing} · New, accepted {r.confirmed}
              </TipLine>
              <TipLine>
                Offers out {r.offered} · {status}
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
                className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 rounded-md px-1.5 py-1.5 outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="truncate text-sm text-fg">{r.label}</span>
                <span
                  className="flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]"
                  style={{ background: "var(--viz-track)" }}
                  aria-hidden
                >
                  {taken > 0 && (
                    <span
                      className={r.offered ? "" : "rounded-r-[4px]"}
                      style={{ width: `${pct(taken)}%`, background: "var(--viz-1)" }}
                    />
                  )}
                  {r.offered > 0 && (
                    <span
                      className="rounded-r-[4px]"
                      style={{ width: `${pct(r.offered)}%`, background: "var(--viz-2)" }}
                    />
                  )}
                </span>
                <span
                  className={`text-right text-sm tabular-nums ${r.free === 0 ? "font-semibold text-fg" : "text-muted"}`}
                >
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
