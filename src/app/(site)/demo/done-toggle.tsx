"use client";

import { useEffect, useState } from "react";

const KEY = "aurelia-demo-done";

/** A viewer's own tick-list. Kept in the browser only: nothing about the presenter is stored on the server. */
export function DoneToggle({ n, title }: { n: number; title: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      setDone((JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]).includes(n));
    } catch {
      /* storage unavailable: the tick just won't persist */
    }
  }, [n]);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={done}
        className="size-5"
        aria-label={`Shown: ${title}`}
        onChange={(e) => {
          setDone(e.target.checked);
          try {
            const set = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]);
            if (e.target.checked) set.add(n);
            else set.delete(n);
            localStorage.setItem(KEY, JSON.stringify([...set]));
          } catch {
            /* ignore */
          }
        }}
      />
      Shown
    </label>
  );
}
