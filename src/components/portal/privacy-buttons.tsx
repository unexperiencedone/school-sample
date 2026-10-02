"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { privacyRequestAction } from "@/app/portal/actions";

export function PrivacyButtons() {
  const [pending, start] = useTransition();
  const go = (kind: "EXPORT" | "DELETION") =>
    start(async () => {
      if (
        kind === "DELETION" &&
        !window.confirm(
          "Ask the school to erase your personal data? Records the law requires us to keep are retained.",
        )
      )
        return;
      const r = await privacyRequestAction(kind);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => go("EXPORT")}>
        Request a copy of my data
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => go("DELETION")}>
        Ask for my data to be erased
      </Button>
    </div>
  );
}
