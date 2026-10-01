"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/crm/action-form";
import { importStatementAction, matchLineAction, setLineStatusAction } from "../actions";

export function ImportForm() {
  return (
    <ActionForm action={importStatementAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Bank statement (.csv)</span>
        <Input type="file" name="file" accept=".csv,text/csv" required className="h-9 py-1.5" />
      </label>
      <Button type="submit" size="sm">
        Import and match
      </Button>
    </ActionForm>
  );
}

export function LineControls({
  lineId,
  status,
  suggestions,
}: {
  lineId: string;
  status: string;
  suggestions: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const report = (r: { ok: true; message?: string } | { ok: false; error: string }) => {
    if (r.ok) toast.success(r.message ?? "Done");
    else toast.error(r.error);
  };
  if (status === "MATCHED" || status === "IGNORED")
    return (
      <button
        type="button"
        disabled={pending}
        className="text-xs text-primary underline"
        onClick={() => start(async () => report(await setLineStatusAction(lineId, "UNMATCHED")))}
      >
        {status === "MATCHED" ? "Unmatch" : "Restore"}
      </button>
    );
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {suggestions.length > 0 && (
        <select
          aria-label="Match to payment"
          disabled={pending}
          defaultValue=""
          className="h-8 max-w-56 rounded-md border border-line bg-elevated px-2 text-xs"
          onChange={(e) =>
            e.target.value && start(async () => report(await matchLineAction(lineId, e.target.value)))
          }
        >
          <option value="">Match to…</option>
          {suggestions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={pending}
        className="text-xs text-muted underline"
        onClick={() => start(async () => report(await setLineStatusAction(lineId, "IGNORED")))}
      >
        Not a fee
      </button>
    </span>
  );
}
