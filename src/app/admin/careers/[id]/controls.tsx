"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { StaffAppStatus } from "@prisma/client";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  BOARD_STAGES,
  canMoveStage,
  SCORE_CRITERIA,
  SCORE_MAX,
  STAGE_LABEL,
  type BoardStage,
  type ScoreKey,
  type StoredScorecard,
} from "@/lib/services/careers-admin-rules";
import { addNoteAction, addToStaffAction, moveStageFormAction, saveScorecardAction } from "../actions";

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="h-11">
      <Printer aria-hidden /> Print
    </Button>
  );
}

/** Move to another stage. Only the moves the server would accept are offered; rejecting needs a reason. */
export function StageForm({ id, status }: { id: string; status: StaffAppStatus }) {
  const targets = BOARD_STAGES.filter((s) => canMoveStage(status, s).ok);
  const [to, setTo] = useState<BoardStage | "">("");
  if (targets.length === 0)
    return (
      <p className="text-sm text-muted">
        {status === "HIRED" ? "Hired is the final stage." : "No moves available."}
      </p>
    );
  return (
    <ActionForm action={moveStageFormAction.bind(null, id)} resetOnSuccess className="space-y-3">
      <Field id="stage-to" label="Move to">
        <Select
          id="stage-to"
          name="to"
          required
          value={to}
          onChange={(e) => setTo(e.target.value as BoardStage | "")}
        >
          <option value="" disabled>
            Choose a stage…
          </option>
          {targets.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      {to === "REJECTED" && (
        <Field
          id="stage-reason"
          label="Reason for rejecting"
          required
          hint="Kept in the notes and the audit log."
        >
          <Textarea id="stage-reason" name="reason" rows={3} required minLength={5} maxLength={500} />
        </Field>
      )}
      <Button type="submit" className="h-11 w-full">
        Move application
      </Button>
    </ActionForm>
  );
}

/** Five ratings from 1 to 5 with a running total. Scoring again replaces the earlier scorecard. */
export function ScorecardForm({ id, card }: { id: string; card: StoredScorecard | null }) {
  const [values, setValues] = useState<Partial<Record<ScoreKey, number>>>(
    card ? Object.fromEntries(SCORE_CRITERIA.map((c) => [c.key, card[c.key]])) : {},
  );
  const total = SCORE_CRITERIA.reduce((n, c) => n + (values[c.key] ?? 0), 0);
  const complete = SCORE_CRITERIA.every((c) => values[c.key]);
  return (
    <ActionForm action={saveScorecardAction.bind(null, id)} className="space-y-4">
      {SCORE_CRITERIA.map((c) => (
        <fieldset key={c.key} className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium text-fg">{c.label}</legend>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="relative grid min-h-11 min-w-11 flex-1 cursor-pointer place-items-center rounded-md border border-line-strong/70 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name={c.key}
                  value={n}
                  required
                  checked={values[c.key] === n}
                  onChange={() => setValues((v) => ({ ...v, [c.key]: n }))}
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-sm" aria-live="polite">
        <span className="text-muted">Total </span>
        <strong className="tabular-nums" data-testid="score-total">
          {complete ? total : "—"}
        </strong>
        <span className="text-muted"> / {SCORE_MAX}</span>
        <span className="block text-xs text-muted">1 is weak, 5 is outstanding. Score all five.</span>
      </p>
      <Field id="score-comment" label="Summary (optional)">
        <Textarea
          id="score-comment"
          name="comment"
          rows={3}
          maxLength={600}
          defaultValue={card?.comment ?? ""}
        />
      </Field>
      <Button type="submit" className="h-11 w-full">
        Save scorecard
      </Button>
    </ActionForm>
  );
}

export function NoteForm({ id }: { id: string }) {
  return (
    <ActionForm action={addNoteAction.bind(null, id)} resetOnSuccess className="space-y-3">
      <Field id="note-body" label="Add an internal note" hint="Only HR and the Principal can see notes.">
        <Textarea id="note-body" name="body" rows={3} required maxLength={2000} />
      </Field>
      <Button type="submit" variant="outline" className="h-11 w-full">
        Add note
      </Button>
    </ActionForm>
  );
}

export function AddToStaffForm({
  id,
  defaults,
  today,
}: {
  id: string;
  defaults: { firstName: string; lastName: string; designation: string; department: string; phone: string };
  today: string;
}) {
  return (
    <ActionForm
      action={addToStaffAction.bind(null, id)}
      redirectTo="/admin/careers/staff"
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Field id="staff-first" label="First name" required>
          <Input
            id="staff-first"
            name="firstName"
            defaultValue={defaults.firstName}
            required
            maxLength={60}
          />
        </Field>
        <Field id="staff-last" label="Last name" required>
          <Input id="staff-last" name="lastName" defaultValue={defaults.lastName} required maxLength={60} />
        </Field>
      </div>
      <Field id="staff-designation" label="Designation" required>
        <Input
          id="staff-designation"
          name="designation"
          defaultValue={defaults.designation}
          required
          maxLength={100}
        />
      </Field>
      <Field id="staff-department" label="Department" required>
        <Input
          id="staff-department"
          name="department"
          defaultValue={defaults.department}
          required
          maxLength={80}
        />
      </Field>
      <Field id="staff-phone" label="Phone">
        <Input id="staff-phone" name="phone" type="tel" defaultValue={defaults.phone} maxLength={20} />
      </Field>
      <Field id="staff-joined" label="Joining date" required>
        <Input id="staff-joined" name="joinedOn" type="date" defaultValue={today} required />
      </Field>
      <Button type="submit" className="h-11 w-full">
        Add to staff directory
      </Button>
    </ActionForm>
  );
}
