"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCurrentYearAction } from "../actions";

export function MakeCurrent({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Make ${name} the current year? Dashboards, fees and the roll will all switch to it.`,
          )
        )
          return;
        start(async () => {
          const r = await setCurrentYearAction(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      Make current
    </Button>
  );
}
