"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideConcessionAction } from "../actions";

/** Approve / reject with a recorded note. The server refuses if the decider is the requester. */
export function ConcessionDecision({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const decide = (d: "APPROVED" | "REJECTED") => {
    const note = window.prompt(
      d === "APPROVED" ? "Approval note (e.g. committee minute)" : "Why is this rejected?",
    );
    if (!note) return;
    start(async () => {
      const r = await decideConcessionAction(id, d, note);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  };
  return (
    <span className="flex gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => decide("APPROVED")}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("REJECTED")}>
        Reject
      </Button>
    </span>
  );
}
