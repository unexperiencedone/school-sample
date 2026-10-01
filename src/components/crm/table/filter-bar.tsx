"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterField =
  | { type: "search"; name: string; label: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { type: "date"; name: string; label: string };

/** URL-driven filters: every change updates the query string (shareable, back-button friendly, server-rendered). */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const search = fields.find((f) => f.type === "search");
  const [q, setQ] = useState(search ? (sp.get(search.name) ?? "") : "");

  const apply = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("after");
    p.delete("before");
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (!search) return;
    if ((sp.get(search.name) ?? "") === q) return;
    const t = setTimeout(() => apply({ [search.name]: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = fields.filter((f) => f.type !== "search" && sp.get(f.name)).length + (q ? 1 : 0);

  return (
    <div className={cn("flex flex-wrap items-end gap-2", pending && "opacity-70", className)} role="search">
      {fields.map((f) =>
        f.type === "search" ? (
          <label key={f.name} className="relative min-w-56 flex-1">
            <span className="sr-only">{f.label}</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={f.placeholder ?? f.label}
              data-table-search
              className="h-9 w-full rounded-md border border-line bg-elevated pr-3 pl-8 text-sm"
            />
          </label>
        ) : f.type === "select" ? (
          <label key={f.name} className="text-xs text-muted">
            <span className="mb-1 block">{f.label}</span>
            <select
              value={sp.get(f.name) ?? ""}
              onChange={(e) => apply({ [f.name]: e.target.value || null })}
              className="h-9 rounded-md border border-line bg-elevated px-2 text-sm text-fg"
            >
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label key={f.name} className="text-xs text-muted">
            <span className="mb-1 block">{f.label}</span>
            <input
              type="date"
              value={sp.get(f.name) ?? ""}
              onChange={(e) => apply({ [f.name]: e.target.value || null })}
              className="h-9 rounded-md border border-line bg-elevated px-2 text-sm text-fg"
            />
          </label>
        ),
      )}
      {active > 0 && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            apply(Object.fromEntries(fields.map((f) => [f.name, null])));
          }}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-sunken hover:text-fg"
        >
          <X className="size-3.5" aria-hidden /> Clear ({active})
        </button>
      )}
    </div>
  );
}
