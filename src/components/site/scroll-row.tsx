"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Horizontal scroll-snap carousel. Works with touch, trackpad, keyboard (Tab through items) and the arrow buttons. */
export function ScrollRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (d: number) =>
    ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="relative">
      <div className="mb-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => scroll(-1)}
          className="rounded-full border border-line-strong p-2.5 hover:bg-sunken"
          aria-label={`Scroll ${label} left`}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          className="rounded-full border border-line-strong p-2.5 hover:bg-sunken"
          aria-label={`Scroll ${label} right`}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <ul
        ref={ref}
        aria-label={label}
        className="relative -mx-4 flex snap-x snap-mandatory [scrollbar-width:thin] gap-5 overflow-x-auto scroll-smooth px-4 pb-4"
      >
        {children}
      </ul>
    </div>
  );
}
