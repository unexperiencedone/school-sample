import type { ReactNode } from "react";

/** A horizontally scrollable table wrapper that keyboard users can reach and scroll (a labelled, focusable region). */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative w-full overflow-x-auto focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus"
    >
      {children}
    </div>
  );
}
