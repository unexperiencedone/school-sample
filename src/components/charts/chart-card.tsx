"use client";

import { useId, useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The container every dashboard chart mounts in: title, caption, optional legend and action, and a
 * Chart / Table toggle — the table is the accessible twin of the chart and is always one click away.
 */
export function ChartCard({
  title,
  caption,
  action,
  legend,
  chart,
  table,
  footer,
  className,
}: {
  title: string;
  caption?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <figure
      aria-labelledby={`${id}-title`}
      className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-elevated", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[0.95rem] font-semibold text-fg">
            {title}
          </h2>
          {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <div
            className="flex rounded-md border border-line p-0.5"
            role="group"
            aria-label={`${title}: view as`}
          >
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted transition-colors",
                  view === v ? "bg-sunken text-fg" : "hover:text-fg",
                )}
              >
                {v === "chart" ? (
                  <BarChart3 className="size-3.5" aria-hidden />
                ) : (
                  <Table2 className="size-3.5" aria-hidden />
                )}
                {v === "chart" ? "Chart" : "Table"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {legend && view === "chart" && <div className="px-5 pt-3">{legend}</div>}
      <div className="flex-1 px-5 pt-3 pb-4">{view === "chart" ? chart : table}</div>
      {footer && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">{footer}</div>}
    </figure>
  );
}

/** Swatch + label pairs. Text stays in ink tokens; only the swatch carries the series colour. */
export function Legend({ items }: { items: { label: string; color: string; outline?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("inline-block size-2.5 rounded-[3px]", i.outline && "border border-line-strong")}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
