"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { school } from "@/config/school";

/** Drawer body, code-split from the provider so Radix + the form load on first open only. */
export default function EnquiryDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side="right"
        title="Enquire now"
        description={`Tell us a little about your daughter and we'll call you within one working day. Or ring ${school.contact.admissionsPhone}.`}
      >
        <EnquiryForm source="drawer" compact onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
