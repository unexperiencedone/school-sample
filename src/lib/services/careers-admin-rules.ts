import { z } from "zod";
import type { StaffAppStatus } from "@prisma/client";
import { applicantName, type StaffApplicationData } from "../schemas/staff-application";

/**
 * Pure rules for the careers CRM: pipeline stages and allowed moves, the scorecard, vacancy and staff input schemas,
 * and safeguarding flags (employment gaps live in the shared application schema). No database and no server-only imports, so the seed, the client components
 * and the unit tests can all share it (relative imports only, for the same reason).
 */

// ─── Pipeline ────────────────────────────────────────────────────────────────────────────────

export const PIPELINE_STAGES = ["RECEIVED", "SHORTLISTED", "INTERVIEW", "OFFER", "HIRED"] as const;
export const BOARD_STAGES = [...PIPELINE_STAGES, "REJECTED"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

export const STAGE_LABEL: Record<StaffAppStatus, string> = {
  DRAFT: "Draft",
  RECEIVED: "Received",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export function isBoardStage(v: string | null | undefined): v is BoardStage {
  return !!v && (BOARD_STAGES as readonly string[]).includes(v);
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/**
 * Which stage changes are allowed. Drafts are not part of the pipeline, a hire must follow an offer, and a hired
 * application is final (the person then belongs in the staff directory). A rejected application can be reopened.
 */
export function canMoveStage(from: StaffAppStatus, to: StaffAppStatus): MoveCheck {
  if (from === "DRAFT") return { ok: false, reason: "This application has not been submitted yet" };
  if (to === "DRAFT") return { ok: false, reason: "A submitted application cannot go back to draft" };
  if (from === to) return { ok: false, reason: `Already in ${STAGE_LABEL[to]}` };
  if (from === "HIRED") return { ok: false, reason: "A hired application is final" };
  if (to === "HIRED" && from !== "OFFER")
    return { ok: false, reason: "Make an offer before marking as hired" };
  return { ok: true };
}

export const moveInput = z
  .object({
    to: z.enum(BOARD_STAGES, { message: "Choose a stage" }),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.to === "REJECTED" && (v.reason ?? "").length < 5)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Give a reason for rejecting (a few words)",
      });
  });

export function stageNoteBody(from: StaffAppStatus, to: StaffAppStatus, reason?: string): string {
  return `Moved from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}.${reason ? ` Reason: ${reason}` : ""}`;
}

// ─── Scorecard ───────────────────────────────────────────────────────────────────────────────

export const SCORE_CRITERIA = [
  { key: "subjectKnowledge", label: "Subject knowledge" },
  { key: "teachingAndLearning", label: "Teaching and learning" },
  { key: "safeguardingAwareness", label: "Safeguarding awareness" },
  { key: "schoolValues", label: "Fit with school values" },
  { key: "references", label: "References" },
] as const;
export type ScoreKey = (typeof SCORE_CRITERIA)[number]["key"];
export const SCORE_MAX = SCORE_CRITERIA.length * 5;

const rating = z.coerce
  .number({ message: "Score every criterion from 1 to 5" })
  .int("Score every criterion from 1 to 5")
  .min(1, "Score every criterion from 1 to 5")
  .max(5, "Score every criterion from 1 to 5");

export const scorecardInput = z.object({
  subjectKnowledge: rating,
  teachingAndLearning: rating,
  safeguardingAwareness: rating,
  schoolValues: rating,
  references: rating,
  comment: z.string().trim().max(600, "Keep the summary to 600 characters").optional().default(""),
});
export type ScorecardInput = z.output<typeof scorecardInput>;

/** What is stored in `StaffApplication.scorecard`: the five ratings plus who scored and when. */
export const storedScorecard = scorecardInput.extend({
  scoredById: z.string(),
  scoredByName: z.string().nullable(),
  scoredAt: z.string(),
});
export type StoredScorecard = z.output<typeof storedScorecard>;

export const scorecardTotal = (c: Record<ScoreKey, number>) =>
  SCORE_CRITERIA.reduce((sum, { key }) => sum + c[key], 0);

export function readScorecard(json: unknown): StoredScorecard | null {
  const r = storedScorecard.safeParse(json);
  return r.success ? r.data : null;
}

// ─── Reading an application ──────────────────────────────────────────────────────────────────

/** `StaffApplication.data` is Json; drafts may hold any subset of the steps. */
export function readData(json: unknown): StaffApplicationData {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as StaffApplicationData) : {};
}

export type SafeguardingFlag = { key: "convictions" | "pendingAction"; label: string; detail: string };

/** Declarations that need a human to read them before the application goes any further. */
export function safeguardingFlags(data: StaffApplicationData): SafeguardingFlag[] {
  const d = data.declaration;
  const flags: SafeguardingFlag[] = [];
  if (d?.convictions === "DECLARE")
    flags.push({
      key: "convictions",
      label: "Declares a conviction, caution or reprimand",
      detail: d.convictionsDetail?.trim() || "No details were given.",
    });
  if (d?.pendingAction === "DECLARE")
    flags.push({
      key: "pendingAction",
      label: "Declares pending action (investigation, charge or proceedings)",
      detail: d.pendingActionDetail?.trim() || "No details were given.",
    });
  return flags;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2024-03" → "Mar 2024" */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
}

export function displayName(row: { fullName: string | null; email: string; data?: unknown }): string {
  return row.fullName?.trim() || applicantName(readData(row.data), row.email);
}

// ─── Vacancies ───────────────────────────────────────────────────────────────────────────────

export const VACANCY_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export const EMPLOYMENT_SUGGESTIONS = [
  "Full-time",
  "Full-time, residential",
  "Full-time, shifts",
  "Part-time",
  "Fixed-term",
] as const;

const isRealDate = (v: string) => {
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().startsWith(v);
};
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine(isRealDate, "Choose a real date");

/** One requirement per line (or an array from the API): trims, strips bullets, drops blanks and repeats. */
export function parseRequirements(input: string | string[]): string[] {
  const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
  const cleaned = lines.map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  return [...new Set(cleaned)];
}

export const vacancyShape = z.object({
  title: z.string().trim().min(3, "Give the vacancy a title").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "The web address needs at least 3 characters")
    .max(90)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and single hyphens"),
  department: z.string().trim().min(2, "Enter a department").max(80),
  employment: z.string().trim().min(2, "Enter the type of employment").max(60),
  location: z.string().trim().min(2, "Enter a location").max(120),
  summary: z
    .string()
    .trim()
    .min(10, "Write a one-line summary")
    .max(300, "Keep the summary under 300 characters"),
  description: z.string().trim().min(40, "Describe the role in a few sentences").max(8000),
  requirements: z
    .union([z.string(), z.array(z.string())])
    .transform(parseRequirements)
    .pipe(
      z
        .array(z.string().max(200, "Keep each requirement under 200 characters"))
        .min(1, "Add at least one requirement")
        .max(20, "No more than 20 requirements"),
    ),
  closesAt: dateOnly,
  status: z.enum(VACANCY_STATUSES, { message: "Choose a status" }),
});
export type VacancyInput = z.output<typeof vacancyShape>;
export const vacancyPatch = vacancyShape.partial();

/** A closing date is the end of that day in IST, so "closes 15 Nov" means candidates can apply all day. */
export function closingInstant(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T23:59:59+05:30`);
}

/** An OPEN vacancy only shows on the website while its closing date is ahead of us. */
export function openError(v: Pick<VacancyInput, "status" | "closesAt">, now: Date): string | null {
  return v.status === "OPEN" && closingInstant(v.closesAt) < now
    ? "An open vacancy needs a closing date in the future. Choose a later date, or close the vacancy."
    : null;
}

export function vacancyIsLive(v: { status: string; closesAt: Date }, now: Date): boolean {
  return v.status === "OPEN" && v.closesAt >= now;
}

// ─── Staff directory ─────────────────────────────────────────────────────────────────────────

const STAFF_PHONE = /^\+?[\d][\d\s-]{6,18}$/;
export const staffContact = z.object({
  designation: z.string().trim().min(2, "Enter a designation").max(100),
  department: z.string().trim().min(2, "Enter a department").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || STAFF_PHONE.test(v), "Enter a phone number, e.g. +91 98765 43210")
    .optional()
    .default(""),
});

export const newStaffInput = staffContact.extend({
  firstName: z.string().trim().min(1, "Enter a first name").max(60),
  lastName: z.string().trim().min(1, "Enter a last name").max(60),
  joinedOn: dateOnly,
});

const TITLES = /^(dr|mr|mrs|ms|miss|mx|prof)\.?$/i;

/** Pre-fills the "add to staff directory" form from a hired application. */
export function staffFromApplication(
  data: StaffApplicationData,
  vacancy: { title: string; department: string } | null,
) {
  const tokens = (data.personal?.fullName ?? "").split(/\s+/).filter((t) => t && !TITLES.test(t));
  return {
    firstName: tokens[0] ?? "",
    lastName: tokens.slice(1).join(" "),
    designation: vacancy?.title ?? data.current?.role ?? "",
    department: vacancy?.department ?? "",
    phone: data.personal?.phone ?? "",
  };
}
