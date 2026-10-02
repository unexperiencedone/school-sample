"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "min-h-11 rounded-md border border-line bg-elevated px-3 text-sm text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Year and date-range filters. They live in the URL, so a report view can be shared and the back button works. */
export function ReportFilters({
  years,
  year,
  from,
  to,
  showRange,
}: {
  years: string[];
  year: string;
  from: string | null;
  to: string | null;
  showRange: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const apply = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div
      role="search"
      aria-label="Report filters"
      className={cn("mb-5 flex flex-wrap items-end gap-3", pending && "opacity-70")}
    >
      <label className="text-xs text-muted">
        <span className="mb-1 block">Academic year</span>
        <select
          value={year}
          onChange={(e) => apply({ year: e.target.value, from: null, to: null })}
          className={control}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {showRange && (
        <>
          <label className="text-xs text-muted">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={from ?? ""}
              onChange={(e) => apply({ from: e.target.value || null })}
              className={control}
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={to ?? ""}
              onChange={(e) => apply({ to: e.target.value || null })}
              className={control}
            />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => apply({ from: null, to: null })}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm text-muted hover:bg-sunken hover:text-fg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X className="size-3.5" aria-hidden /> Clear dates
            </button>
          )}
        </>
      )}
    </div>
  );
}
