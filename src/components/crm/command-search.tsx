"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Hit = { type: string; label: string; sub: string; href: string };

/** Global CRM search. Press "/" or Ctrl/⌘+K to focus; ↑/↓ to move; Enter to open. */
export function CommandSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) {
          setHits(((await res.json()) as { data: Hit[] }).data);
          setActive(0);
        }
      } catch {
        /* aborted */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (hit?: Hit) => {
    if (!hit) return;
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  return (
    <div className="relative w-full max-w-md">
      <Search
        className="text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
        aria-label="Search students, leads, applications"
        placeholder="Search students, leads, applications…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          }
        }}
        className="border-line bg-sunken placeholder:text-muted focus-visible:bg-elevated h-9 w-full rounded-md border pr-12 pl-8 text-sm"
      />
      <kbd className="border-line text-muted pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 text-[0.65rem] sm:block">
        /
      </kbd>
      {open && hits.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="border-line bg-elevated shadow-lift absolute top-11 right-0 left-0 z-50 max-h-96 overflow-y-auto rounded-lg border p-1"
        >
          {hits.map((h, i) => (
            <li
              key={h.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${i === active ? "bg-sunken" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{h.label}</span>
                <span className="text-muted block truncate text-xs">{h.sub}</span>
              </span>
              <span className="bg-sunken text-muted shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] tracking-wide uppercase">
                {h.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
