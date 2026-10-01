"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { TipLine, TipTitle, useChartTooltip } from "./tooltip";

export type BarListRow = {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
  href?: string;
  /** CSS colour for this bar; defaults to categorical slot 1 (one nominal series). */
  color?: string;
};

/**
 * Horizontal bars with the value at the row end. Bars are 14px thick, anchored square at the baseline with a 4px
 * rounded data end; the whole row is the hit target (hover/focus shows the detail tooltip, click drills in).
 */
export function BarList({ rows, ariaLabel }: { rows: BarListRow[]; ariaLabel: string }) {
  const tt = useChartTooltip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div ref={tt.ref} className="relative" onMouseLeave={tt.hide}>
      <ul aria-label={ariaLabel} className="space-y-0.5">
        {rows.map((r) => {
          const content = (
            <>
              <TipTitle>{r.label}</TipTitle>
              <TipLine>{r.detail ?? r.display}</TipLine>
            </>
          );
          const inner = (
            <>
              <span className="truncate text-sm text-fg">{r.label}</span>
              <span className="relative h-3.5 border-l border-line-strong" aria-hidden>
                {r.value > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--viz-1)" }}
                  />
                )}
              </span>
              <span className="text-right text-sm font-medium text-fg tabular-nums">{r.display}</span>
            </>
          );
          const cls =
            "grid grid-cols-[minmax(6.5rem,9.5rem)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1.5 outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-focus";
          const handlers = {
            onMouseMove: tt.onPointer(content),
            onFocus: tt.onFocus(content),
            onBlur: tt.hide,
            "aria-label": `${r.label}: ${r.detail ?? r.display}`,
          };
          return (
            <li key={r.key}>
              {r.href ? (
                <Link href={r.href} className={cn(cls, "cursor-pointer")} {...handlers}>
                  {inner}
                </Link>
              ) : (
                <div tabIndex={0} className={cls} {...handlers}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {tt.node}
    </div>
  );
}
