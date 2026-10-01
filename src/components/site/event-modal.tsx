"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicEvent } from "@/lib/content";

const EventModalBody = dynamic(() => import("./event-modal-body"), { ssr: false });
const KEY = "ah_event_modal_seen";
const SKIP = /^\/(admissions\/register|careers\/apply|book-a-tour|contact|login|mock-pay)/;

/** Open House invitation: once per session, after a short delay, never on form/login/payment pages. */
export function EventModal({ event }: { event: PublicEvent | null }) {
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!event || SKIP.test(pathname)) return;
    try {
      if (sessionStorage.getItem(KEY) === event.slug) return;
    } catch {
      return;
    }
    const t = setTimeout(() => {
      setShow(true);
      try {
        sessionStorage.setItem(KEY, event.slug);
      } catch {
        /* storage blocked */
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [event, pathname]);
  return show && event ? <EventModalBody event={event} /> : null;
}
