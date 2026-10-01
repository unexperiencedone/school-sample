"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setLeadStatus } from "../actions";
import { cn } from "@/lib/utils";

type Card = {
  id: string;
  parentName: string;
  childName: string | null;
  classApplying: string;
  source: string;
  status: string;
  age: string;
};

/**
 * Kanban by lead status. Drag a card to another column, or use the card's "Move to" menu (keyboard/screen-reader path).
 */
export function LeadBoard({
  columns,
  cards,
  canWrite,
}: {
  columns: { value: string; label: string; count: number }[];
  cards: Card[];
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const [optimistic, move] = useOptimistic(cards, (state, { id, status }: { id: string; status: string }) =>
    state.map((c) => (c.id === id ? { ...c, status } : c)),
  );
  const moveTo = (id: string, status: string) => {
    let reason: string | null | undefined;
    if (status === "LOST") {
      reason = window.prompt("Why was this lead lost?");
      if (!reason) return;
    }
    start(async () => {
      move({ id, status });
      const r = await setLeadStatus(id, status, reason ?? undefined);
      if (!r.ok) toast.error(r.error);
    });
  };
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-4", pending && "cursor-progress")}>
      {columns.map((col) => {
        const list = optimistic.filter((c) => c.status === col.value);
        return (
          <section
            key={col.value}
            aria-label={`${col.label} (${col.count})`}
            onDragOver={(e) => canWrite && e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/lead");
              if (id && canWrite) moveTo(id, col.value);
            }}
            className="flex w-64 shrink-0 flex-col rounded-lg bg-sunken p-2"
          >
            <h2 className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
              {col.label} <span className="rounded-full bg-elevated px-2 py-0.5 text-fg">{col.count}</span>
            </h2>
            <ul className="mt-1 flex-1 space-y-2">
              {list.map((c) => (
                <li
                  key={c.id}
                  draggable={canWrite}
                  onDragStart={(e) => e.dataTransfer.setData("text/lead", c.id)}
                  className="rounded-md border border-line bg-elevated p-3 text-sm shadow-soft"
                >
                  <Link href={`/admin/leads/${c.id}`} className="font-medium hover:underline">
                    {c.parentName}
                  </Link>
                  <p className="text-xs text-muted">
                    {c.childName ?? "—"} · {c.classApplying}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {c.source} · {c.age}
                  </p>
                  {canWrite && (
                    <label className="mt-2 block">
                      <span className="sr-only">Move {c.parentName} to</span>
                      <select
                        value={c.status}
                        onChange={(e) => moveTo(c.id, e.target.value)}
                        className="h-7 w-full rounded border border-line bg-bg px-1 text-xs"
                      >
                        {columns.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value === c.status ? `In: ${o.label}` : `Move to ${o.label}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              ))}
              {col.count > list.length && (
                <li className="px-2 text-xs text-muted">+{col.count - list.length} more in the inbox</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
