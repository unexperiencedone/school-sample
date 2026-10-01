"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideRefundAction, processRefundAction } from "../actions";

/** The next step for a refund, for whoever may take it. The server re-checks permission and maker–checker. */
export function RefundActions({
  id,
  status,
  canApprove,
  canProcess,
  isRequester,
  manual,
}: {
  id: string;
  status: string;
  canApprove: boolean;
  canProcess: boolean;
  isRequester: boolean;
  manual: boolean;
}) {
  const [pending, start] = useTransition();
  const report = (r: { ok: true; message?: string } | { ok: false; error: string }) => {
    if (r.ok) toast.success(r.message ?? "Done");
    else toast.error(r.error);
  };
  if (status === "REQUESTED" && canApprove)
    return isRequester ? (
      <span className="text-xs text-muted">Needs another approver</span>
    ) : (
      <span className="flex gap-1.5">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            const note = window.prompt("Approval note");
            if (note) start(async () => report(await decideRefundAction(id, "APPROVED", note)));
          }}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const note = window.prompt("Why is this refund rejected?");
            if (note) start(async () => report(await decideRefundAction(id, "REJECTED", note)));
          }}
        >
          Reject
        </Button>
      </span>
    );
  if (status === "APPROVED" && canProcess)
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          const ref = manual ? window.prompt("Bank transfer reference (UTR) for the refund") : "";
          if (manual && !ref) return;
          start(async () => report(await processRefundAction(id, ref ?? "")));
        }}
      >
        {manual ? "Record payout" : "Refund via gateway"}
      </Button>
    );
  return null;
}
