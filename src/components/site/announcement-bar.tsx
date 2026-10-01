"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BarItem } from "@/lib/content";

/** Rotating announcement bar. Pauses on hover/focus; arrows for manual control; static for reduced motion. */
export function AnnouncementBar({ items }: { items: BarItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [paused, items.length]);
  if (!items.length) return null;
  const item = items[i]!;
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);
  return (
    <div
      className="no-print relative z-50 bg-damson-950 text-[0.8rem] text-paper"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container-site flex h-9 items-center justify-center gap-3">
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="rounded p-1 text-damson-300 hover:text-paper"
            aria-label="Previous announcement"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        )}
        <p key={i} className="page-enter min-w-0 truncate text-center" aria-live="polite">
          <span className="font-semibold text-marigold-300">{item.title}</span>
          <span className="hidden text-damson-300 sm:inline"> — {item.body}</span>
          {item.href && (
            <Link
              href={item.href}
              className="ml-2 underline decoration-marigold-500 underline-offset-2 hover:text-marigold-300"
            >
              Find out more
            </Link>
          )}
        </p>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="rounded p-1 text-damson-300 hover:text-paper"
            aria-label="Next announcement"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
