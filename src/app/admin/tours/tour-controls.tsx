"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bookingStatusAction, createSlotsAction } from "./actions";
import { formatDate } from "@/lib/dates";

export function BookingButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const set = (s: string) =>
    start(async () => {
      const r = await bookingStatusAction(id, s);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  if (status === "CHECKED_IN") return <span className="text-xs font-medium text-success">Checked in</span>;
  if (status !== "BOOKED")
    return (
      <button type="button" className="text-xs underline" onClick={() => set("BOOKED")} disabled={pending}>
        Restore
      </button>
    );
  return (
    <span className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => set("CHECKED_IN")}>
        Check in
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("NO_SHOW")}>
        No-show
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("CANCELLED")}>
        Cancel
      </Button>
    </span>
  );
}

export function SlotCreator() {
  const [pending, start] = useTransition();
  const today = formatDate(new Date(), "yyyy-MM-dd"); // the school's calendar day (IST), not UTC
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createSlotsAction(fd);
          if (r.ok) toast.success(r.message ?? "Created");
          else toast.error(r.error);
        });
      }}
      className="grid gap-3 text-sm sm:grid-cols-2"
    >
      <label className="text-xs text-muted">
        <span className="mb-1 block">From</span>
        <input
          type="date"
          name="from"
          defaultValue={today}
          required
          className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <label className="text-xs text-muted">
        <span className="mb-1 block">For how many days</span>
        <input
          type="number"
          name="days"
          min={1}
          max={31}
          defaultValue={14}
          className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <fieldset className="text-xs text-muted sm:col-span-2">
        <legend className="mb-1">Times (IST)</legend>
        <div className="flex gap-4 text-sm text-fg">
          {["09:30", "11:30", "14:30"].map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="times"
                value={t}
                defaultChecked
                className="accent-[var(--primary)]"
              />{" "}
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs text-muted">
        <span className="mb-1 block">Families per slot</span>
        <input
          type="number"
          name="capacity"
          min={1}
          max={50}
          defaultValue={6}
          className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <label className="text-xs text-muted">
        <span className="mb-1 block">Label</span>
        <input
          name="label"
          defaultValue="Campus tour"
          className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="skipSundays" defaultChecked className="accent-[var(--primary)]" /> Skip
        Sundays
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create slots"}
        </Button>
      </div>
    </form>
  );
}
