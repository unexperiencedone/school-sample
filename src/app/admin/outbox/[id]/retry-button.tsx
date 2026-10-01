"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryOutboxAction } from "../actions";

export function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryOutboxAction(id);
          if (r.ok) toast.success(r.message ?? "Sent");
          else toast.error(r.error);
        })
      }
    >
      Retry now
    </Button>
  );
}
