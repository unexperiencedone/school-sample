"use client";

import type { ReactNode } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/** A plain link that fires an analytics event on click (no-op without consent). */
export function TrackedLink({
  href,
  event,
  props,
  className,
  children,
}: {
  href: string;
  event: AnalyticsEvent;
  props?: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={() => track(event, props)}>
      {children}
    </a>
  );
}
