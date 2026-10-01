"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/**
 * A form bound to a server action: pending state, a toast with the outcome, optional confirm prompt, reset and
 * redirect on success. The fieldset is disabled while saving so a double click can't submit twice.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  redirectTo,
}: {
  action: (form: FormData) => Promise<Result>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  redirectTo?: string | ((id?: string) => string);
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className={className}
      // onSubmit rather than `action`: React resets uncontrolled fields after a form action even when it fails,
      // which would wipe what the person typed on a validation error.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action(fd);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Saved");
          if (resetOnSuccess) ref.current?.reset();
          if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(r.id) : redirectTo);
        });
      }}
    >
      <fieldset
        disabled={pending}
        className={cn("contents", pending && "[&_button[type=submit]]:opacity-70")}
      >
        {children}
      </fieldset>
    </form>
  );
}
