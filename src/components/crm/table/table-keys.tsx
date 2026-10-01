"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts for CRM tables: j/k move between rows, Enter opens, x toggles selection.
 * Rows opt in with data-row and contain one [data-row-link].
 */
export function TableKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.isContentEditable ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      const rows = [...document.querySelectorAll<HTMLElement>("[data-row]")];
      if (!rows.length) return;
      const i = rows.findIndex((r) => r.contains(document.activeElement));
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = rows[Math.min(Math.max(i + (e.key === "j" ? 1 : -1), 0), rows.length - 1)] ?? rows[0]!;
        next.querySelector<HTMLElement>("[data-row-link]")?.focus();
      } else if (e.key === "x" && i >= 0) {
        e.preventDefault();
        rows[i]!.querySelector<HTMLInputElement>("[data-row-select]")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
