"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canMoveStage, STAGE_LABEL, type BoardStage } from "@/lib/services/careers-admin-rules";
import { cn } from "@/lib/utils";
import { moveStageAction } from "./actions";
import { FlagBadge, ScoreText } from "./badges";

export type BoardCard = {
  id: string;
  ref: string;
  name: string;
  vacancy: string | null;
  score: number | null;
  submitted: string;
  flagged: boolean;
  status: BoardStage;
};

export type BoardColumn = { stage: BoardStage; count: number; shown: number };

/**
 * Kanban of submitted applications by stage. Drag a card to another stage, or use the card's "Move to" menu (the
 * keyboard and screen-reader path). Rejecting asks for a reason. The server decides what is allowed.
 */
export function ApplicationBoard({
  columns,
  cards,
  canWrite,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<BoardCard | null>(null);
  const [reason, setReason] = useState("");
  const [optimistic, move] = useOptimistic(
    cards,
    (state, { id, status }: { id: string; status: BoardStage }) =>
      state.map((c) => (c.id === id ? { ...c, status } : c)),
  );

  const send = (card: BoardCard, status: BoardStage, why?: string) =>
    start(async () => {
      move({ id: card.id, status });
      const r = await moveStageAction(card.id, status, why);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`${card.name} moved to ${STAGE_LABEL[status]}`);
        setRejecting(null);
        setReason("");
      }
    });

  const request = (id: string, status: BoardStage) => {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.status === status) return;
    const check = canMoveStage(card.status, status);
    if (!check.ok) return void toast.error(check.reason);
    if (status === "REJECTED") return setRejecting(card);
    send(card, status);
  };

  // Counts follow the optimistic move so the headers never disagree with the cards
  const moved = new Map(cards.map((c) => [c.id, c.status]));
  const delta = (stage: BoardStage) =>
    optimistic.reduce(
      (n, c) =>
        n +
        (c.status === stage && moved.get(c.id) !== stage ? 1 : 0) -
        (c.status !== stage && moved.get(c.id) === stage ? 1 : 0),
      0,
    );

  return (
    <>
      <div className={cn("flex gap-3 overflow-x-auto pb-4", pending && "cursor-progress")}>
        {columns.map((col) => {
          const list = optimistic.filter((c) => c.status === col.stage);
          const count = col.count + delta(col.stage);
          const headingId = `col-${col.stage}`;
          return (
            <section
              key={col.stage}
              aria-labelledby={headingId}
              data-testid={`column-${col.stage}`}
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/staff-application");
                if (id && canWrite) request(id, col.stage);
              }}
              className="flex w-64 shrink-0 flex-col rounded-lg bg-sunken p-2"
            >
              <h2
                id={headingId}
                className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                {STAGE_LABEL[col.stage]}
                <span className="rounded-full bg-elevated px-2 py-0.5 text-fg">
                  {count}
                  <span className="sr-only"> applications</span>
                </span>
              </h2>
              <ul className="mt-1 flex-1 space-y-2">
                {list.map((c) => (
                  <li
                    key={c.id}
                    draggable={canWrite && c.status !== "HIRED"}
                    onDragStart={(e) => e.dataTransfer.setData("text/staff-application", c.id)}
                    className="rounded-md border border-line bg-elevated p-3 text-sm shadow-soft"
                  >
                    <Link
                      href={`/admin/careers/${c.id}`}
                      className="block min-h-6 py-0.5 font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted">{c.vacancy ?? "General application"}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span>{c.ref}</span>
                      <span>{c.submitted}</span>
                      <ScoreText score={c.score} />
                    </p>
                    {c.flagged && (
                      <p className="mt-2">
                        <FlagBadge />
                      </p>
                    )}
                    {canWrite && c.status !== "HIRED" && (
                      <label className="mt-2 block">
                        <span className="sr-only">Move {c.name} to</span>
                        <select
                          value={c.status}
                          onChange={(e) => request(c.id, e.target.value as BoardStage)}
                          className="h-9 w-full rounded border border-line bg-bg px-1 text-xs"
                        >
                          {columns.map((o) => (
                            <option
                              key={o.stage}
                              value={o.stage}
                              disabled={o.stage !== c.status && !canMoveStage(c.status, o.stage).ok}
                            >
                              {o.stage === c.status
                                ? `In: ${STAGE_LABEL[o.stage]}`
                                : `Move to ${STAGE_LABEL[o.stage]}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
                {list.length === 0 && <li className="px-2 py-3 text-xs text-muted">Nothing here</li>}
                {col.count > col.shown && (
                  <li className="px-2 text-xs text-muted">
                    +{col.count - col.shown} more. Use the table view to see them all.
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setReason("");
          }
        }}
      >
        <DialogContent
          title={`Reject ${rejecting?.name ?? "application"}`}
          description="The reason is kept in the application's notes and the audit log."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (rejecting) send(rejecting, "REJECTED", reason);
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="board-reject-reason" required>
                Reason for rejecting
              </Label>
              <Textarea
                id="board-reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                minLength={5}
                maxLength={500}
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={pending}>
                Reject application
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
