"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { waiveLateFeeAction } from "../../actions";

/** Waive one instalment's late fee — permissioned, and the reason goes on the audit trail. */
export function WaiveLateFee({ instalmentId }: { instalmentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-primary underline disabled:opacity-50"
      onClick={() => {
        const note = window.prompt("Why is this late fee being waived?");
        if (!note) return;
        start(async () => {
          const r = await waiveLateFeeAction(instalmentId, note);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      Waive
    </button>
  );
}
