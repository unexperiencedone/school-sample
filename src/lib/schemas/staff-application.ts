import { z } from "zod";
import { email, personName, phone } from "./common";

/**
 * The 9-step staff application. One schema per step, shared by the public form, the API and the admin views.
 * `StaffApplication.data` (Json) holds `{ personal, family, education, current, history, interests, statement,
 * references, declaration }`; each key is the output of the matching step schema, and drafts may hold any subset.
 */

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).optional().or(z.literal(""));
/** yyyy-mm (month inputs) */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use month and year");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");

export const STEPS = [
  { key: "personal", title: "Personal details" },
  { key: "family", title: "Family & emergency contact" },
  { key: "education", title: "Education & training" },
  { key: "current", title: "Current employment" },
  { key: "history", title: "Employment history" },
  { key: "interests", title: "Subjects & interests" },
  { key: "statement", title: "Personal statement" },
  { key: "references", title: "References" },
  { key: "declaration", title: "Declaration" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export const SUBJECTS = [
  "English",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "History",
  "Geography",
  "Economics",
  "Business Studies",
  "Psychology",
  "Hindi",
  "French",
  "Spanish",
  "Art & Design",
  "Music",
  "Drama",
  "Physical Education",
  "Early Years",
  "Learning Support",
  "Library",
  "Boarding care",
  "Nursing & wellbeing",
] as const;

export const PHASES = [
  "Early Years",
  "Prep (Years 1–6)",
  "Middle School (Years 7–9)",
  "Upper School (Years 10–13)",
] as const;

export const personalStep = z.object({
  title: z.enum(["Ms", "Mrs", "Miss", "Mr", "Mx", "Dr"]),
  fullName: personName,
  dob: isoDate,
  gender: z.enum(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]),
  nationality: text(60).min(2, "Enter your nationality"),
  email,
  phone,
  address: text(400).min(8, "Enter your address"),
  noticeOrAvailability: optional(120),
});

export const familyStep = z.object({
  maritalStatus: optional(40),
  children: z
    .array(z.object({ name: text(100).min(2), dob: isoDate }))
    .max(8)
    .default([]),
  emergencyName: personName,
  emergencyRelation: text(60).min(2, "How are they related to you?"),
  emergencyPhone: phone,
});

export const educationItem = z.object({
  qualification: text(150).min(2, "Qualification"),
  institution: text(150).min(2, "Institution"),
  year: z.coerce.number().int().min(1960).max(2100),
  grade: optional(60),
  /** Storage key of an uploaded certificate (never a resume/CV in place of the form). */
  certificateKey: optional(300),
});
export const educationStep = z.object({
  items: z.array(educationItem).min(1, "Add at least one qualification").max(12),
});

export const currentStep = z.object({
  employed: z.boolean(),
  employer: optional(150),
  role: optional(120),
  since: month.optional().or(z.literal("")),
  noticePeriod: optional(60),
  reasonForLeaving: optional(300),
});

export const historyItem = z
  .object({
    employer: text(150).min(2, "Employer"),
    role: text(120).min(2, "Role"),
    from: month,
    to: month,
    reasonForLeaving: optional(300),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "End date is before the start date" });
export const historyStep = z.object({ items: z.array(historyItem).max(20).default([]) });

export const interestsStep = z.object({
  subjects: z.array(z.enum(SUBJECTS)).min(1, "Choose at least one subject or area").max(8),
  phases: z.array(z.enum(PHASES)).min(1, "Choose at least one phase"),
  interests: optional(500),
});

export const STATEMENT_WORDS = { min: 150, max: 700 } as const;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const statementStep = z.object({
  text: z
    .string()
    .trim()
    .refine((t) => wordCount(t) >= STATEMENT_WORDS.min, `Write at least ${STATEMENT_WORDS.min} words`)
    .refine((t) => wordCount(t) <= STATEMENT_WORDS.max, `Keep it to ${STATEMENT_WORDS.max} words or fewer`),
});

export const referenceItem = z.object({
  name: personName,
  role: text(120).min(2, "Their job title"),
  organisation: text(150).min(2, "Organisation"),
  email,
  phone: optional(20),
  relationship: text(120).min(2, "How do they know you?"),
  isCurrentEmployer: z.boolean().default(false),
});
export const referencesStep = z.object({
  items: z
    .array(referenceItem)
    .min(2, "Provide two referees")
    .max(4)
    .refine(
      (r) => r.some((x) => x.isCurrentEmployer),
      "One referee must be your current (or most recent) employer",
    ),
});

export const declarationStep = z.object({
  safeguarding: z.literal(true, { message: "Please confirm the safeguarding statement" }),
  convictions: z.enum(["NONE", "DECLARE"], { message: "Please answer this question" }),
  convictionsDetail: optional(1000),
  pendingAction: z.enum(["NONE", "DECLARE"], { message: "Please answer this question" }),
  pendingActionDetail: optional(1000),
  consent: z.literal(true, { message: "We need your consent to process the application" }),
  truthful: z.literal(true, { message: "Please confirm the information is accurate" }),
});

export const STEP_SCHEMAS = {
  personal: personalStep,
  family: familyStep,
  education: educationStep,
  current: currentStep,
  history: historyStep,
  interests: interestsStep,
  statement: statementStep,
  references: referencesStep,
  declaration: declarationStep,
} as const;

export type StaffApplicationData = {
  personal?: z.input<typeof personalStep>;
  family?: z.input<typeof familyStep>;
  education?: z.input<typeof educationStep>;
  current?: z.input<typeof currentStep>;
  history?: z.input<typeof historyStep>;
  interests?: z.input<typeof interestsStep>;
  statement?: z.input<typeof statementStep>;
  references?: z.input<typeof referencesStep>;
  declaration?: z.input<typeof declarationStep>;
};

/** True when every step validates. Used on submit. */
export function validateAll(data: StaffApplicationData) {
  const errors: Partial<Record<StepKey, z.ZodError>> = {};
  for (const { key } of STEPS) {
    const r = STEP_SCHEMAS[key].safeParse(data[key] ?? {});
    if (!r.success) errors[key] = r.error;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export type Gap = { from: string; to: string; months: number };

const toIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/**
 * Safer recruitment asks for an explanation of any gap in employment. Reports gaps longer than `minMonths` between
 * consecutive jobs (history plus the current post, which runs to `now`).
 */
export function employmentGaps(jobs: { from: string; to: string }[], now: string, minMonths = 3): Gap[] {
  const sorted = [...jobs].sort((a, b) => a.from.localeCompare(b.from));
  const gaps: Gap[] = [];
  let coveredTo = -1;
  for (const j of sorted) {
    const start = toIndex(j.from);
    const end = toIndex(j.to > now ? now : j.to);
    if (coveredTo >= 0 && start - coveredTo - 1 >= minMonths)
      gaps.push({ from: fromIndex(coveredTo + 1), to: fromIndex(start - 1), months: start - coveredTo - 1 });
    coveredTo = Math.max(coveredTo, end);
  }
  return gaps;
}

/** Display name for a stored application (the draft may not have a name yet). */
export function applicantName(data: StaffApplicationData | null | undefined, fallback = "Applicant") {
  return data?.personal?.fullName?.trim() || fallback;
}
