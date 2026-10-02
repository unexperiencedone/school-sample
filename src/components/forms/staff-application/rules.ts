import { z } from "zod";
import {
  STEPS,
  STEP_SCHEMAS,
  currentStep,
  declarationStep,
  employmentGaps,
  personalStep,
  statementStep,
  type Gap,
  type StaffApplicationData,
  type StepKey,
} from "@/lib/schemas/staff-application";
import { formatDate } from "@/lib/dates";

/**
 * Pure rules for the public staff application, shared by the browser form and the API.
 * The base step schemas live in `src/lib/schemas/staff-application.ts`; the `FORM_SCHEMAS` here only tighten them
 * (age, a current employer when employed, detail when a declaration is made, a hard cap on statement length), so
 * anything that passes `FORM_SCHEMAS` also passes `validateAll`.
 */

export type Issue = { path: string; message: string };

export const MIN_APPLICANT_AGE = 18;
export const STATEMENT_MAX_CHARS = 8000;
export const MIN_DECLARATION_DETAIL = 10;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Today's IST calendar date as yyyy-mm-dd. */
export function todayIst(now = new Date()): string {
  return formatDate(now, "yyyy-MM-dd");
}

/** The current IST month as yyyy-mm. */
export function currentMonthIst(now = new Date()): string {
  return formatDate(now, "yyyy-MM");
}

/** Whole years between two yyyy-mm-dd dates (no time zones involved). */
export function ageOnDate(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age;
}

type Ctx = z.RefinementCtx;
const add = (ctx: Ctx, path: string, message: string) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

const personalForm = personalStep.superRefine((v, ctx) => {
  if (!ISO_DATE.test(v.dob)) return;
  const today = todayIst();
  if (v.dob > today) add(ctx, "dob", "Date of birth can't be in the future");
  else if (ageOnDate(v.dob, today) < MIN_APPLICANT_AGE)
    add(ctx, "dob", `Applicants must be at least ${MIN_APPLICANT_AGE} years old`);
});

const currentForm = currentStep.superRefine((v, ctx) => {
  if (!v.employed) return;
  if (!v.employer?.trim()) add(ctx, "employer", "Enter your current employer");
  if (!v.role?.trim()) add(ctx, "role", "Enter your job title");
  if (!v.since) add(ctx, "since", "Choose the month you started");
});

const statementForm = statementStep.superRefine((v, ctx) => {
  if (v.text.length > STATEMENT_MAX_CHARS) add(ctx, "text", "That is too long. Please shorten it.");
});

/** An unticked checkbox is `false`, for which Zod's literal check ignores a custom `message`; `errorMap` always applies. */
const confirmed = (message: string) => z.literal(true, { errorMap: () => ({ message }) });

const declarationForm = declarationStep
  .extend({
    safeguarding: confirmed("Please confirm the safeguarding statement"),
    consent: confirmed("We need your consent to process the application"),
    truthful: confirmed("Please confirm the information is accurate"),
  })
  .superRefine((v, ctx) => {
    const need = (answer: string, detail: string | undefined, path: string) => {
      if (answer === "DECLARE" && (detail?.trim().length ?? 0) < MIN_DECLARATION_DETAIL)
        add(ctx, path, "Please give details so we can consider them fairly");
    };
    need(v.convictions, v.convictionsDetail, "convictionsDetail");
    need(v.pendingAction, v.pendingActionDetail, "pendingActionDetail");
  });

/** Step schemas used by the form and the API. */
export const FORM_SCHEMAS = {
  ...STEP_SCHEMAS,
  personal: personalForm,
  current: currentForm,
  statement: statementForm,
  declaration: declarationForm,
} as const;

export const toIssues = (error: z.ZodError): Issue[] =>
  error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

export function stepKeyFor(step: number): StepKey | null {
  return STEPS[step - 1]?.key ?? null;
}

/** Issues per step for a whole application (missing steps are validated as empty, so they fail). */
export function applicationIssues(data: StaffApplicationData): Partial<Record<StepKey, Issue[]>> {
  const out: Partial<Record<StepKey, Issue[]>> = {};
  for (const { key } of STEPS) {
    const r = FORM_SCHEMAS[key].safeParse(data[key] ?? {});
    if (!r.success) out[key] = toIssues(r.error);
  }
  return out;
}

/** 1-based number of the first step that has issues, or null. */
export function firstFailingStep(issues: Partial<Record<StepKey, Issue[]>>): number | null {
  const i = STEPS.findIndex(({ key }) => (issues[key]?.length ?? 0) > 0);
  return i === -1 ? null : i + 1;
}

/** Zod's default wording is not for applicants. */
export function friendlyMessage(message: string): string {
  if (message === "Required") return "This field is required";
  const short = /^String must contain at least (\d+) character/.exec(message);
  if (short)
    return Number(short[1]) <= 1 ? "This field is required" : `Enter at least ${short[1]} characters`;
  if (/^Number must be/.test(message) || /^Expected number/.test(message)) return "Enter a valid year";
  if (
    /^Invalid enum value/.test(message) ||
    /^Invalid input/.test(message) ||
    /^Expected boolean/.test(message)
  )
    return "Choose an option";
  if (/^Array must contain at least/.test(message)) return "Add at least one";
  return message;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2019-03" becomes "Mar 2019". */
export function monthLabel(month: string): string {
  if (!MONTH.test(month)) return month;
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Jobs to test for gaps: every well-formed history row plus the current post (which runs to the current month). */
export function jobsForGaps(
  data: Pick<StaffApplicationData, "history" | "current">,
  now: string,
): { from: string; to: string }[] {
  const jobs = (data.history?.items ?? [])
    .filter((j) => MONTH.test(j.from ?? "") && MONTH.test(j.to ?? "") && j.to >= j.from)
    .map((j) => ({ from: j.from, to: j.to }));
  const cur = data.current;
  if (cur?.employed && cur.since && MONTH.test(cur.since) && cur.since <= now)
    jobs.push({ from: cur.since, to: now });
  return jobs;
}

export function gapsFor(data: Pick<StaffApplicationData, "history" | "current">, now: string): Gap[] {
  return employmentGaps(jobsForGaps(data, now), now);
}

export function describeGap(g: Gap): string {
  return `${monthLabel(g.from)} to ${monthLabel(g.to)} (${g.months} ${g.months === 1 ? "month" : "months"})`;
}

/** Detail text only makes sense next to a "declare" answer; drop it otherwise. */
export function tidyDeclaration<
  T extends {
    convictions: string;
    convictionsDetail?: string;
    pendingAction: string;
    pendingActionDetail?: string;
  },
>(d: T): T {
  return {
    ...d,
    convictionsDetail: d.convictions === "DECLARE" ? d.convictionsDetail?.trim() : "",
    pendingActionDetail: d.pendingAction === "DECLARE" ? d.pendingActionDetail?.trim() : "",
  };
}
