"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Adds `.is-visible` to [data-reveal] elements as they scroll into view. CSS handles motion (and reduced-motion). */
export function RevealObserver() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    // Page-enter transition only for client navigations — never on first load, where it would delay LCP.
    if (first.current) first.current = false;
    else document.documentElement.classList.add("has-navigated");
  }, [pathname]);
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
