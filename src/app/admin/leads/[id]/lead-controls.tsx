"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  assignLead,
  completeReminder,
  mergeLeadAction,
  noteLead,
  remindLead,
  setLeadStatus,
  type ActionResult,
} from "../actions";
import { formatDate } from "@/lib/dates";

function report(r: ActionResult, ok = "Saved"): void {
  if (r.ok) toast.success(r.message ?? ok);
  else toast.error(r.error);
}

export function StatusControl({
  id,
  status,
  statuses,
}: {
  id: string;
  status: string;
  statuses: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <label className="text-xs text-muted">
      <span className="mb-1 block">Status</span>
      <select
        className="h-9 rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          const reason =
            v === "LOST"
              ? window.prompt("Why was this lead lost? (e.g. chose another school, fees, distance)")
              : undefined;
          if (v === "LOST" && !reason) return;
          start(async () => report(await setLeadStatus(id, v, reason ?? undefined), "Status updated"));
        }}
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AssignControl({
  id,
  assignedToId,
  staff,
  disabled,
}: {
  id: string;
  assignedToId: string | null;
  staff: { id: string; name: string | null }[];
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label className="text-xs text-muted">
      <span className="mb-1 block">Assigned to</span>
      <select
        className="h-9 rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        value={assignedToId ?? ""}
        disabled={pending || disabled}
        onChange={(e) => start(async () => report(await assignLead(id, e.target.value || null), "Assigned"))}
      >
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NoteForm({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      action={(fd) =>
        start(async () => {
          const r = await noteLead(id, fd);
          report(r, "Note added");
          if (r.ok) setKey((k) => k + 1);
        })
      }
      className="space-y-2"
    >
      <label htmlFor="note-body" className="sr-only">
        Note
      </label>
      <Textarea id="note-body" name="body" rows={3} placeholder="Log a call, email or note…" required />
      <div className="flex items-center gap-2">
        <select
          name="kind"
          aria-label="Activity type"
          className="h-8 rounded-md border border-line bg-elevated px-2 text-sm"
        >
          <option value="NOTE">Note</option>
          <option value="CALL">Call</option>
          <option value="EMAIL">Email</option>
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
      </div>
    </form>
  );
}

export function ReminderForm({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState(0);
  const tomorrow = formatDate(new Date(Date.now() + 86400_000), "yyyy-MM-dd"); // IST calendar day
  return (
    <form
      key={key}
      action={(fd) =>
        start(async () => {
          const r = await remindLead(id, fd);
          report(r, "Reminder set");
          if (r.ok) setKey((k) => k + 1);
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <label className="min-w-40 flex-1 text-xs text-muted">
        <span className="mb-1 block">Reminder</span>
        <input
          name="title"
          required
          placeholder="e.g. Call after tour"
          className="h-8 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <label className="text-xs text-muted">
        <span className="mb-1 block">Due</span>
        <input
          type="date"
          name="dueAt"
          defaultValue={tomorrow}
          required
          className="h-8 rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Set
      </Button>
    </form>
  );
}

export function DoneButton({ reminderId }: { reminderId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => report(await completeReminder(reminderId), "Done"))}
      className="text-xs text-primary underline"
    >
      Mark done
    </button>
  );
}

export function MergeButton({
  keepId,
  mergeIds,
  label,
}: {
  keepId: string;
  mergeIds: string[];
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (
          window.confirm(`Merge ${label} into this lead? Their history, bookings and applications move here.`)
        )
          start(async () => report(await mergeLeadAction(keepId, mergeIds)));
      }}
    >
      {pending ? "Merging…" : "Merge into this lead"}
    </Button>
  );
}
