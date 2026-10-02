"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteVacancyAction, setVacancyStatusAction } from "../actions";

/** Close an open vacancy, or reopen one. Reopening after the closing date has passed asks for a new date. */
export function VacancyStatusButton({
  id,
  title,
  open,
  needsNewDate,
  suggestedDate,
}: {
  id: string;
  title: string;
  open: boolean;
  needsNewDate: boolean;
  suggestedDate: string;
}) {
  if (open)
    return (
      <ActionForm
        action={() => setVacancyStatusAction(id, "CLOSED")}
        confirm={`Close "${title}"? It will disappear from the website.`}
      >
        <Button type="submit" variant="outline" size="sm" aria-label={`Close ${title}`}>
          Close
        </Button>
      </ActionForm>
    );
  return (
    <ActionForm
      action={(form) =>
        setVacancyStatusAction(id, "OPEN", needsNewDate ? String(form.get("closesAt") ?? "") : undefined)
      }
      className="flex items-end gap-2"
    >
      {needsNewDate && (
        <div>
          <Label htmlFor={`reopen-${id}`} className="mb-1 text-xs">
            New closing date
          </Label>
          <Input
            id={`reopen-${id}`}
            name="closesAt"
            type="date"
            required
            defaultValue={suggestedDate}
            className="h-9 w-40"
          />
        </div>
      )}
      <Button type="submit" variant="outline" size="sm" aria-label={`Reopen ${title}`}>
        Reopen
      </Button>
    </ActionForm>
  );
}

export function DeleteVacancyButton({
  id,
  title,
  applications,
}: {
  id: string;
  title: string;
  applications: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (applications > 0)
    return (
      <p className="text-sm text-muted">
        This vacancy has {applications} application{applications === 1 ? "" : "s"}, so it can&apos;t be
        deleted. Close it instead.
      </p>
    );
  return (
    <Button
      variant="danger"
      className="h-11"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
        start(async () => {
          const r = await deleteVacancyAction(id);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Deleted");
          router.push("/admin/careers/vacancies");
        });
      }}
    >
      Delete vacancy
    </Button>
  );
}
