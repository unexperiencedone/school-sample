"use client";

import { useCallback, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";

type Tip = { x: number; y: number; content: ReactNode } | null;

/**
 * Pointer- and focus-driven tooltip positioned inside a `relative` chart container. Follows the pointer,
 * anchors above the focused mark for keyboard users, and flips left near the right edge.
 */
export function useChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);

  const at = useCallback((x: number, y: number, content: ReactNode) => {
    setTip({ x, y, content });
  }, []);

  const onPointer = useCallback(
    (content: ReactNode) => (e: MouseEvent<HTMLElement | SVGElement>) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      at(e.clientX - box.left, e.clientY - box.top, content);
    },
    [at],
  );

  const onFocus = useCallback(
    (content: ReactNode) => (e: FocusEvent<HTMLElement | SVGElement>) => {
      const box = ref.current?.getBoundingClientRect();
      const el = e.currentTarget.getBoundingClientRect();
      if (!box) return;
      at(el.left - box.left + el.width / 2, el.top - box.top, content);
    },
    [at],
  );

  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg shadow-lift"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${(ref.current?.clientWidth ?? 0) - tip.x < 200 ? "calc(-100% - 12px)" : "12px"}, calc(-100% - 8px))`,
      }}
    >
      {tip.content}
    </div>
  ) : null;

  return { ref, node, onPointer, onFocus, hide, active: tip !== null };
}

export function TipTitle({ children }: { children: ReactNode }) {
  return <p className="font-semibold text-fg">{children}</p>;
}
export function TipLine({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}
