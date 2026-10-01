"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { moveStageAction, previewOfferAction, saveAssessmentAction, verifyDocumentAction } from "../actions";

type Preview = {
  totalPaise: number;
  instalments: { label: string; dueDate: string; amountPaise: number }[];
} | null;

const ACTION_LABEL: Record<string, string> = {
  DOCUMENTS: "Start document check",
  ASSESSMENT: "Move to assessment",
  REVIEW: "Send to review",
  OFFER: "Make an offer",
  FEE_PAID: "Record fee as paid (offline)",
  ADMITTED: "Admit",
  WAITLISTED: "Waitlist",
  REJECTED: "Decline",
  WITHDRAWN: "Mark withdrawn",
};

/** Allowed next steps for this application, with the extra inputs some decisions need. */
export function StageActions({
  id,
  allowed,
  canDecide,
  sections,
}: {
  id: string;
  allowed: string[];
  canDecide: boolean;
  sections: { id: string; name: string; count: number; capacity: number }[];
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState("THREE");
  const [message, setMessage] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [preview, setPreview] = useState<Preview>(null);
  const [pending, start] = useTransition();
  const decisions = ["OFFER", "WAITLISTED", "REJECTED", "ADMITTED"];

  const open = (t: string) => {
    setTarget(t);
    setNote("");
    if (t === "OFFER") start(async () => setPreview(await previewOfferAction(id, plan)));
  };

  if (!allowed.length)
    return <p className="text-sm text-muted">No further actions — this application is closed.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allowed.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={t === "REJECTED" || t === "WITHDRAWN" ? "ghost" : target === t ? "primary" : "outline"}
            disabled={pending || (decisions.includes(t) && !canDecide)}
            onClick={() => open(t)}
            title={
              decisions.includes(t) && !canDecide ? "Needs the applications:decide permission" : undefined
            }
          >
            {ACTION_LABEL[t] ?? t}
          </Button>
        ))}
      </div>
      {target && (
        <div className="space-y-3 rounded-lg border border-line bg-sunken p-4">
          {target === "OFFER" && (
            <div>
              <label className="text-sm">
                Instalment plan for the first-year invoice{" "}
                <select
                  value={plan}
                  onChange={(e) => {
                    setPlan(e.target.value);
                    start(async () => setPreview(await previewOfferAction(id, e.target.value)));
                  }}
                  className="ml-2 h-8 rounded-md border border-line bg-elevated px-2"
                >
                  <option value="ONE">Annual</option>
                  <option value="TWO">Two instalments</option>
                  <option value="THREE">Three instalments</option>
                </select>
              </label>
              {preview && (
                <div className="mt-3 rounded-md bg-elevated p-3 text-sm">
                  <p className="font-medium">First-year invoice preview: {formatINR(preview.totalPaise)}</p>
                  <ul className="mt-1 text-muted">
                    {preview.instalments.map((i) => (
                      <li key={i.label}>
                        {i.label} · due {formatDate(i.dueDate)} · {formatINR(i.amountPaise)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">
                    Sibling and founding-family concessions apply automatically once guardians are linked;
                    scholarships after approval.
                  </p>
                </div>
              )}
            </div>
          )}
          {target === "ADMITTED" && (
            <label className="block text-sm">
              Section
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="ml-2 h-8 rounded-md border border-line bg-elevated px-2"
              >
                <option value="">Auto (least full)</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.count >= s.capacity}>
                    {s.name} ({s.count}/{s.capacity})
                  </option>
                ))}
              </select>
            </label>
          )}
          {target === "REJECTED" && (
            <label className="block text-sm">
              Message to the family (optional — a kind default is used otherwise)
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </label>
          )}
          <label className="block text-sm">
            Internal note
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1"
              placeholder="Visible to staff on the timeline"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await moveStageAction(id, target, note, { planCode: plan, message, sectionId });
                  if (r.ok) {
                    toast.success(r.message ?? "Updated");
                    setTarget(null);
                  } else toast.error(r.error);
                })
              }
            >
              {pending ? "Saving…" : `Confirm: ${ACTION_LABEL[target]}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
          {["OFFER", "REJECTED", "WAITLISTED", "ADMITTED"].includes(target) && (
            <p className="text-xs text-muted">
              The family is notified by email{target !== "OFFER" ? " and WhatsApp" : ""}. This action is
              audit-logged.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function DocumentActions({ docId }: { docId: string }) {
  const [pending, start] = useTransition();
  const act = (status: "VERIFIED" | "REJECTED") =>
    start(async () => {
      const note =
        status === "REJECTED"
          ? (window.prompt("What needs fixing? (shown to the family)") ?? undefined)
          : undefined;
      if (status === "REJECTED" && !note) return;
      const r = await verifyDocumentAction(docId, status, note);
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
    });
  return (
    <span className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("VERIFIED")}>
        Verify
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("REJECTED")}>
        Request re-upload
      </Button>
    </span>
  );
}

export function AssessmentForm({
  id,
  at,
  scores,
  reviewNotes,
}: {
  id: string;
  at: string | null;
  scores: Record<string, string | number | undefined>;
  reviewNotes: string;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveAssessmentAction(id, fd);
          if (r.ok) toast.success(r.message ?? "Saved");
          else toast.error(r.error);
        });
      }}
      className="grid gap-3 sm:grid-cols-4"
    >
      <label className="text-xs text-muted sm:col-span-2">
        <span className="mb-1 block">Assessment date & time</span>
        <input
          type="datetime-local"
          name="at"
          defaultValue={at ?? ""}
          className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
        />
      </label>
      {[
        ["english", "English /100"],
        ["maths", "Maths /100"],
        ["reasoning", "Reasoning /100"],
        ["interview", "Interview /10"],
      ].map(([k, l]) => (
        <label key={k} className="text-xs text-muted">
          <span className="mb-1 block">{l}</span>
          <input
            type="number"
            name={k}
            min={0}
            max={k === "interview" ? 10 : 100}
            defaultValue={scores[k] as number | undefined}
            className="h-9 w-full rounded-md border border-line bg-elevated px-2 text-sm text-fg"
          />
        </label>
      ))}
      <label className="text-xs text-muted sm:col-span-4">
        <span className="mb-1 block">Assessor comments</span>
        <Textarea name="comments" rows={2} defaultValue={(scores.comments as string) ?? ""} />
      </label>
      <label className="text-xs text-muted sm:col-span-4">
        <span className="mb-1 block">Review panel notes</span>
        <Textarea name="reviewNotes" rows={3} defaultValue={reviewNotes} />
      </label>
      <div className="sm:col-span-4">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save assessment"}
        </Button>
      </div>
    </form>
  );
}
