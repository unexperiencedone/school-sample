"use client";

import { useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

const EnquiryForm = dynamic(() => import("@/components/forms/enquiry-form").then((m) => m.EnquiryForm), {
  ssr: false,
});
import type { PublicEvent } from "@/lib/content";
import { formatDate } from "@/lib/dates";

/** Open House invitation. Shown once per session after a short delay; never on forms, login or payment pages. */
export default function EventModalBody({ event }: { event: PublicEvent | null }) {
  const [open, setOpen] = useState(true);
  const [registering, setRegistering] = useState(false);
  if (!event) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={event.title} description={event.summary} className="max-w-xl">
        <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-kiln-700" aria-hidden />
            {formatDate(event.startsAt, "EEEE d MMMM yyyy, h:mm a")}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 text-kiln-700" aria-hidden />
            {event.location}
          </span>
        </div>
        {registering ? (
          <EnquiryForm
            source="event-modal"
            eventSlug={event.slug}
            compact
            submitLabel="Reserve my place"
            onDone={() => setOpen(false)}
          />
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted">{event.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => setRegistering(true)}>Reserve a place</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Maybe later
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
