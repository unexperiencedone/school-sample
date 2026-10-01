import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { Kpi } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";

/**
 * A headline number. The figure is the hero (sans, proportional figures); the delta carries an arrow icon and
 * words, so its good/bad colour is never the only signal. Status uses icon + label.
 */
export function StatTile({ kpi }: { kpi: Kpi }) {
  const d = kpi.delta;
  const DeltaIcon = !d
    ? null
    : d.direction === "up"
      ? ArrowUpRight
      : d.direction === "down"
        ? ArrowDownRight
        : ArrowRight;
  const body = (
    <>
      <p className="text-sm text-muted">{kpi.label}</p>
      <p className="mt-1.5 text-[1.45rem] leading-none font-semibold tracking-tight text-fg sm:text-[1.7rem]">
        {kpi.value}
      </p>
      {d && DeltaIcon && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1 text-xs font-medium",
            d.good === true ? "text-success" : d.good === false ? "text-danger" : "text-muted",
          )}
        >
          <DeltaIcon className="size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">
              {d.direction === "up" ? "Up" : d.direction === "down" ? "Down" : ""}{" "}
            </span>
            {d.text}
          </span>
        </p>
      )}
      {kpi.status === "critical" && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Needs attention
        </p>
      )}
      {kpi.status === "good" && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          All clear
        </p>
      )}
      {kpi.sub && <p className="mt-1.5 text-xs text-muted">{kpi.sub}</p>}
    </>
  );
  const cls = "block rounded-lg border border-line bg-elevated px-3.5 py-3.5 sm:px-4 sm:py-4";
  return kpi.href ? (
    <Link
      href={kpi.href}
      className={cn(
        cls,
        "transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A single progress track (e.g. collection rate). Value is written out; the fill is slot 1 on the neutral track. */
export function Meter({
  label,
  valueText,
  ratio,
  caption,
}: {
  label: string;
  valueText: string;
  ratio: number;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-xl font-semibold text-fg">{valueText}</p>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={valueText}
        className="mt-2 h-3 overflow-hidden rounded-[4px]"
        style={{ background: "var(--viz-track)" }}
      >
        <div className="h-full rounded-r-[4px]" style={{ width: `${pct}%`, background: "var(--viz-1)" }} />
      </div>
      {caption && <p className="mt-1.5 text-xs text-muted">{caption}</p>}
    </div>
  );
}
