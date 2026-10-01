"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible quote carousel: auto-advances (pausable), arrows + dots, live region, no motion for reduced-motion users. */
export function QuoteSlider({
  quotes,
  tone = "light",
}: {
  quotes: { text: string; by: string }[];
  tone?: "light" | "dark";
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing || quotes.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const t = setInterval(() => setI((x) => (x + 1) % quotes.length), 7000);
    return () => clearInterval(t);
  }, [playing, quotes.length]);
  const q = quotes[i]!;
  const dark = tone === "dark";
  return (
    <figure className="relative" aria-roledescription="carousel" aria-label="Quotes">
      <span
        aria-hidden
        className={cn(
          "block font-serif text-8xl leading-none",
          dark ? "text-marigold-500" : "text-marigold-500/80",
        )}
      >
        “
      </span>
      <div aria-live={playing ? "off" : "polite"} className="min-h-[10rem]">
        <blockquote
          key={i}
          className={cn(
            "page-enter -mt-8 font-serif text-[clamp(1.5rem,3vw,2.3rem)] leading-snug",
            dark ? "text-paper" : "text-primary",
          )}
        >
          {q.text}
        </blockquote>
        <figcaption
          key={`c${i}`}
          className={cn("page-enter mt-5 text-sm", dark ? "text-damson-300" : "text-muted")}
        >
          — {q.by}
        </figcaption>
      </div>
      {quotes.length > 1 && (
        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setI((i - 1 + quotes.length) % quotes.length)}
            className={cn(
              "rounded-full border p-2",
              dark ? "border-damson-600 hover:bg-damson-700" : "border-line-strong hover:bg-sunken",
            )}
            aria-label="Previous quote"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setI((i + 1) % quotes.length)}
            className={cn(
              "rounded-full border p-2",
              dark ? "border-damson-600 hover:bg-damson-700" : "border-line-strong hover:bg-sunken",
            )}
            aria-label="Next quote"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={cn("rounded-full p-2", dark ? "hover:bg-damson-700" : "hover:bg-sunken")}
            aria-label={playing ? "Pause quotes" : "Play quotes"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <div className="ml-1 flex">
            {quotes.map((_, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setI(d)}
                aria-label={`Quote ${d + 1} of ${quotes.length}`}
                aria-current={d === i}
                className="grid h-6 min-w-6 place-items-center px-1"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-1.5 rounded-full transition-all",
                    d === i ? "w-6 bg-marigold-500" : cn("w-1.5", dark ? "bg-damson-600" : "bg-line-strong"),
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
