"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type JourneyStep = { title: string; when: string; text: string; details: string[] };

/** Interactive six-step admissions process (tabs pattern: arrow keys move between steps). */
export function AdmissionsJourney({ steps }: { steps: JourneyStep[] }) {
  const [active, setActive] = useState(0);
  const step = steps[active]!;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = steps.length;
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    setActive(next);
    document.getElementById(`step-tab-${next}`)?.focus();
  };
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
      <div role="tablist" aria-label="Admissions steps" aria-orientation="vertical" className="relative">
        <span aria-hidden className="absolute top-6 bottom-6 left-[1.35rem] w-px bg-line-strong" />
        <span
          aria-hidden
          className="absolute top-6 left-[1.35rem] w-px bg-marigold-500 transition-all duration-500"
          style={{
            height: `calc(${(active / (steps.length - 1)) * 100}% - ${(active / (steps.length - 1)) * 3}rem)`,
          }}
        />
        {steps.map((s, i) => (
          <button
            key={s.title}
            id={`step-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls="step-panel"
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className="relative flex w-full items-center gap-5 rounded-lg py-3 pr-4 text-left transition-colors hover:bg-cream"
          >
            <span
              className={cn(
                "relative z-10 grid size-11 shrink-0 place-items-center rounded-full border-2 font-serif text-lg transition-colors",
                i <= active
                  ? "border-marigold-500 bg-marigold-500 text-damson-950"
                  : "border-line-strong bg-paper text-muted",
              )}
            >
              {i + 1}
            </span>
            <span>
              <span className={cn("block font-serif text-xl", i === active ? "text-primary" : "text-fg")}>
                {s.title}
              </span>
              <span className="block text-xs tracking-wide text-muted uppercase">{s.when}</span>
            </span>
          </button>
        ))}
      </div>
      <div
        id="step-panel"
        role="tabpanel"
        aria-labelledby={`step-tab-${active}`}
        tabIndex={0}
        className="rounded-lg bg-damson-900 p-8 text-paper lg:p-12"
      >
        <p className="font-serif text-7xl leading-none text-marigold-500">
          {String(active + 1).padStart(2, "0")}
        </p>
        <h3 key={step.title} className="page-enter mt-4 font-serif text-3xl">
          {step.title}
        </h3>
        <p className="mt-3 text-damson-100">{step.text}</p>
        <ul className="mt-6 space-y-2.5">
          {step.details.map((d) => (
            <li key={d} className="flex gap-3 text-sm text-damson-100">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-t-full bg-marigold-500" />
              {d}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex gap-2">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => setActive(active - 1)}
            className="rounded-full border border-damson-600 px-4 py-2 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={active === steps.length - 1}
            onClick={() => setActive(active + 1)}
            className="rounded-full bg-marigold-500 px-4 py-2 text-sm font-semibold text-damson-950 disabled:opacity-40"
          >
            Next step
          </button>
        </div>
      </div>
    </div>
  );
}
