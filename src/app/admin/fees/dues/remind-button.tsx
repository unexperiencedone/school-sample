"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { remindAction } from "./actions";

export function RemindButton({ instalmentId }: { instalmentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await remindAction(instalmentId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        })
      }
      className="text-xs text-primary underline disabled:opacity-50"
    >
      {pending ? "Sending…" : "Remind"}
    </button>
  );
}
