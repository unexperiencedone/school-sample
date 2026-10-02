"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleCheck, CircleX, LoaderCircle, Play, Send } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/services/settings-rules";
import { runJobAction, testIntegrationAction, type OutcomeResult } from "../actions";

type Outcome = { ok: boolean; message: string; ms: number; href?: string };

const toOutcome = (r: OutcomeResult): Outcome => (r.ok ? r.outcome : { ok: false, message: r.error, ms: 0 });

/** The inline result. The region is always in the page so a screen reader announces it when text arrives. */
function Result({
  id,
  outcome,
  pendingLabel,
}: {
  id: string;
  outcome: Outcome | null;
  pendingLabel: string | null;
}) {
  return (
    <div id={id} role="status" aria-live="polite" className="min-h-6 text-sm">
      {pendingLabel ? (
        <p className="inline-flex items-center gap-1.5 text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {pendingLabel}
        </p>
      ) : (
        outcome && (
          <p className={outcome.ok ? "text-success" : "text-danger"}>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              {outcome.ok ? (
                <CircleCheck className="size-4" aria-hidden />
              ) : (
                <CircleX className="size-4" aria-hidden />
              )}
              {outcome.ok ? "Passed" : "Failed"}
            </span>
            {outcome.ms > 0 && <span className="text-muted"> · {formatDuration(outcome.ms)}</span>}
            <span className="block text-fg">{outcome.message}</span>
            {outcome.href && (
              <Link href={outcome.href} className="text-primary underline underline-offset-4">
                View in the Outbox
              </Link>
            )}
          </p>
        )
      )}
    </div>
  );
}

/** "Send test" for one adapter. WhatsApp and SMS ask for a number first. */
export function TestControl({
  integrationKey,
  label,
  needsPhone,
}: {
  integrationKey: string;
  label: string;
  needsPhone: boolean;
}) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const resultId = `test-result-${integrationKey}`;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setOutcome(null);
    start(async () => setOutcome(toOutcome(await testIntegrationAction(integrationKey, form))));
  };

  return (
    <form onSubmit={submit} className="min-w-56 space-y-2" aria-describedby={resultId}>
      {needsPhone && (
        <div>
          <label htmlFor={`phone-${integrationKey}`} className="mb-1 block text-xs font-medium text-muted">
            Number to test ({label})
          </label>
          <Input
            id={`phone-${integrationKey}`}
            name="phone"
            type="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            required
          />
          <p className="mt-1 text-xs text-muted">
            A self-test: the number&apos;s consent settings aren&apos;t checked.
          </p>
        </div>
      )}
      <Button
        type="submit"
        variant="outline"
        className="h-11"
        disabled={pending}
        aria-label={`Send test: ${label}`}
      >
        <Send aria-hidden /> Send test
      </Button>
      <Result id={resultId} outcome={outcome} pendingLabel={pending ? "Testing…" : null} />
    </form>
  );
}

/** "Run now" for one scheduled job. */
export function RunNowControl({ job, label }: { job: string; label: string }) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const resultId = `run-result-${job}`;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={pending}
        aria-label={`Run now: ${label}`}
        aria-describedby={resultId}
        onClick={() => {
          setOutcome(null);
          start(async () => setOutcome(toOutcome(await runJobAction(job))));
        }}
      >
        <Play aria-hidden /> Run now
      </Button>
      <Result id={resultId} outcome={outcome} pendingLabel={pending ? "Running…" : null} />
    </div>
  );
}
