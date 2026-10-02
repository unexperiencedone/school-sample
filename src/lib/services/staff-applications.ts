import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type StaffAppStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { formatDate } from "@/lib/dates";
import { sendTemplate } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createUpload } from "@/lib/services/uploads";
import { school, siteUrl } from "@/config/school";
import { safeEqual, sha256Hex } from "@/integrations/crypto";
import {
  applicantName,
  STEPS,
  type StaffApplicationData,
  type StepKey,
} from "@/lib/schemas/staff-application";
import {
  applicationIssues,
  firstFailingStep,
  FORM_SCHEMAS,
  stepKeyFor,
  tidyDeclaration,
  toIssues,
  type Issue,
} from "@/components/forms/staff-application/rules";

/**
 * Public staff application: anonymous drafts guarded by an emailed resume token.
 *
 * - The token is 24 random bytes (base64url). Only its sha256 is stored (`resumeTokenHash`); the raw token is
 *   returned once, when the draft is created, and emailed as a link.
 * - A draft that has not been touched for 14 days can no longer be resumed.
 * - A submitted application is read-only (409).
 * - Nothing in here knows about HTTP beyond `ApiError`, so it can be driven from a route, an action or a test.
 */

export const RESUME_TTL_DAYS = 14;
/** Resume-link emails one address may receive per day, however many drafts or saves ask for them. */
export const RESUME_EMAILS_PER_ADDRESS_PER_DAY = 3;
/** Ceiling on certificate files per application (education rows are capped at 12). */
export const MAX_UPLOADS_PER_APPLICATION = 24;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no I, O, 0 or 1

/** SA-2026-K7QF3: year in IST plus five random symbols. A label for people, never a credential. */
export function makeRef(now = new Date(), bytes: Uint8Array = randomBytes(5)): string {
  const suffix = Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
  return `SA-${formatDate(now, "yyyy")}-${suffix}`;
}

export const newResumeToken = (): string => randomBytes(24).toString("base64url");
export const hashResumeToken = (token: string): string => sha256Hex(token);

export function tokenMatches(storedHash: string | null | undefined, token: string): boolean {
  return !!storedHash && safeEqual(storedHash, hashResumeToken(token));
}

export function isDraftExpired(updatedAt: Date, now = new Date()): boolean {
  return now.getTime() - updatedAt.getTime() > RESUME_TTL_DAYS * 86_400_000;
}

export function resumeUrl(id: string, token: string): string {
  return `${siteUrl()}/careers/apply?resume=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
}

export type VacancyRef = { slug: string; title: string; department: string; employment: string };

export type DraftView = {
  id: string;
  ref: string;
  status: StaffAppStatus;
  currentStep: number;
  vacancy: VacancyRef | null;
  /** Only returned while the application is still a draft. */
  data: StaffApplicationData;
  submittedAt: string | null;
};

export type SaveInput = {
  id?: string;
  token?: string;
  /** undefined leaves the vacancy as it is; null or "" means a general application. */
  vacancySlug?: string | null;
  step: number;
  data: unknown;
};
export type SaveResult = {
  id: string;
  ref: string;
  status: "DRAFT";
  currentStep: number;
  /** Present only on the call that created the draft. */
  resumeToken?: string;
  /** Present only when this save asked for a resume email (a new draft, or a changed address); false if none went out. */
  resumeEmailSent?: boolean;
};

const asData = (v: Prisma.JsonValue): StaffApplicationData =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as StaffApplicationData) : {};
const toJson = (v: unknown) => v as Prisma.InputJsonValue;

function validationError(step: number, issues: Issue[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const i of issues) (fieldErrors[i.path.split(".")[0] ?? ""] ??= []).push(i.message);
  return new ApiError(422, "VALIDATION_FAILED", "Some answers need attention", { step, issues, fieldErrors });
}

const appInclude = { vacancy: { select: { slug: true, title: true, department: true, employment: true } } };

/** Loads an application and proves the caller holds its resume token. Unknown id and wrong token look the same. */
async function loadWithAccess(id: string, token: string | undefined) {
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Your resume link is missing.");
  const app = await db.staffApplication.findUnique({ where: { id }, include: appInclude });
  if (!app || !tokenMatches(app.resumeTokenHash, token))
    throw new ApiError(
      403,
      "INVALID_TOKEN",
      "This link isn't valid. Use the latest link we emailed you, or start a new application.",
    );
  return app;
}

type Loaded = Awaited<ReturnType<typeof loadWithAccess>>;

function assertEditable(app: Loaded) {
  if (app.status !== "DRAFT")
    throw new ApiError(409, "ALREADY_SUBMITTED", "This application has already been submitted.");
  if (isDraftExpired(app.updatedAt))
    throw new ApiError(
      410,
      "EXPIRED",
      `This draft link expired after ${RESUME_TTL_DAYS} days. Please start a new application.`,
    );
}

async function resolveVacancyId(slug: string | null | undefined, currentId?: string | null) {
  if (!slug) return null;
  const v = await db.vacancy.findUnique({
    where: { slug },
    select: { id: true, status: true, closesAt: true },
  });
  if (!v)
    throw new ApiError(422, "UNKNOWN_VACANCY", "We couldn't find that vacancy.", {
      fieldErrors: { vacancySlug: ["Choose a vacancy from the list"] },
    });
  // A draft started before the closing date may keep its vacancy; nobody can newly pick a closed one.
  if (v.id !== currentId && (v.status !== "OPEN" || v.closesAt < new Date()))
    throw new ApiError(422, "VACANCY_CLOSED", "That vacancy has closed.", {
      fieldErrors: { vacancySlug: ["This vacancy has closed. Choose another or apply generally"] },
    });
  return v.id;
}

/** Certificates must be files this application uploaded and the storage layer has accepted. */
async function assertCertificatesOwned(applicationId: string, items: { certificateKey?: string }[]) {
  const wanted = items.flatMap((it, index) => (it.certificateKey ? [{ index, key: it.certificateKey }] : []));
  if (!wanted.length) return;
  const stored = await db.upload.findMany({
    where: {
      key: { in: wanted.map((w) => w.key) },
      ownerType: "staff-application",
      ownerId: { startsWith: `${applicationId}:` },
      status: "STORED",
    },
    select: { key: true },
  });
  const ok = new Set(stored.map((s) => s.key));
  const issues = wanted
    .filter((w) => !ok.has(w.key))
    .map((w) => ({ path: `items.${w.index}.certificateKey`, message: "Upload this certificate again" }));
  if (issues.length) throw validationError(3, issues);
}

/**
 * Emails the resume link, at most `RESUME_EMAILS_PER_ADDRESS_PER_DAY` times a day to one address (the key is a hash of
 * the lowercased address, so the limiter never stores it). Returns whether a mail was queued. Neither a limit nor a mail
 * failure may lose the save: the applicant still holds the token in their browser.
 */
async function emailResumeLink(applicationId: string, email: string, token: string): Promise<boolean> {
  try {
    const rl = await rateLimit(
      `staff-app-resume:${sha256Hex(email.toLowerCase())}`,
      RESUME_EMAILS_PER_ADDRESS_PER_DAY,
      86_400,
    );
    if (!rl.ok) {
      console.warn("staff-application resume email skipped: address limit reached", { applicationId });
      return false;
    }
    await sendTemplate({
      template: "staff-application-resume",
      to: { email },
      data: { url: resumeUrl(applicationId, token) },
      channels: ["EMAIL"],
      related: { type: "staff-application", id: applicationId },
    });
    return true;
  } catch (err) {
    console.error("staff-application resume email failed", err);
    return false;
  }
}

/**
 * Saves one step. Without an `id` it creates the draft (step 1 only) and returns the resume token once;
 * with an `id` the matching token is required.
 */
export async function createOrUpdateDraft(input: SaveInput): Promise<SaveResult> {
  const key = stepKeyFor(input.step);
  if (!key) throw new ApiError(422, "BAD_STEP", "Unknown step.");
  const parsed = FORM_SCHEMAS[key].safeParse(input.data);
  if (!parsed.success) throw validationError(input.step, toIssues(parsed.error));
  const value =
    key === "declaration" ? tidyDeclaration(FORM_SCHEMAS.declaration.parse(input.data)) : parsed.data;
  return input.id ? updateDraft(input.id, input.token, key, input, value) : createDraft(key, input, value);
}

async function createDraft(key: StepKey, input: SaveInput, value: unknown): Promise<SaveResult> {
  if (key !== "personal")
    throw new ApiError(422, "START_AT_STEP_ONE", "Please start with your personal details.");
  const personal = value as { email: string };
  const vacancyId = await resolveVacancyId(input.vacancySlug);
  const token = newResumeToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const app = await db.staffApplication.create({
        data: {
          ref: makeRef(),
          vacancyId,
          email: personal.email,
          status: "DRAFT",
          currentStep: 2,
          data: toJson({ personal: value }),
          resumeTokenHash: hashResumeToken(token),
        },
      });
      const resumeEmailSent = await emailResumeLink(app.id, app.email, token);
      return {
        id: app.id,
        ref: app.ref,
        status: "DRAFT",
        currentStep: app.currentStep,
        resumeToken: token,
        resumeEmailSent,
      };
    } catch (err) {
      const duplicateRef = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!duplicateRef) throw err;
    }
  }
  throw new ApiError(500, "REF_EXHAUSTED", "We couldn't create your application. Please try again.");
}

async function updateDraft(
  id: string,
  token: string | undefined,
  key: StepKey,
  input: SaveInput,
  value: unknown,
): Promise<SaveResult> {
  const app = await loadWithAccess(id, token);
  assertEditable(app);
  const vacancyId =
    input.vacancySlug === undefined ? undefined : await resolveVacancyId(input.vacancySlug, app.vacancyId);
  if (key === "education")
    await assertCertificatesOwned(app.id, (value as { items: { certificateKey?: string }[] }).items);

  const email = key === "personal" ? (value as { email: string }).email : undefined;
  const currentStep = Math.max(app.currentStep, Math.min(input.step + 1, STEPS.length));
  const res = await db.staffApplication.updateMany({
    where: { id: app.id, status: "DRAFT" },
    data: {
      data: toJson({ ...asData(app.data), [key]: value }),
      currentStep,
      ...(vacancyId !== undefined && { vacancyId }),
      ...(email && { email }),
    },
  });
  if (res.count === 0)
    throw new ApiError(409, "ALREADY_SUBMITTED", "This application has already been submitted.");
  const base: SaveResult = { id: app.id, ref: app.ref, status: "DRAFT", currentStep };
  if (!email || !token || email.toLowerCase() === app.email.toLowerCase()) return base;
  return { ...base, resumeEmailSent: await emailResumeLink(app.id, email, token) };
}

/** Everything the form needs to continue a draft. A submitted application returns its status and reference only. */
export async function getDraft(id: string, token: string | undefined): Promise<DraftView> {
  const app = await loadWithAccess(id, token);
  const base = {
    id: app.id,
    ref: app.ref,
    status: app.status,
    currentStep: app.currentStep,
    vacancy: app.vacancy,
    submittedAt: app.submittedAt?.toISOString() ?? null,
  };
  if (app.status !== "DRAFT") return { ...base, data: {} };
  assertEditable(app);
  return { ...base, data: asData(app.data) };
}

/** Certificate upload target for a draft's education row (same signed-URL flow as registration documents). */
export async function createCertificateUpload(input: {
  id: string;
  token: string | undefined;
  slot: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  const app = await loadWithAccess(input.id, input.token);
  assertEditable(app);
  const used = await db.upload.count({
    where: { ownerType: "staff-application", ownerId: { startsWith: `${app.id}:` } },
  });
  if (used >= MAX_UPLOADS_PER_APPLICATION)
    throw new ApiError(422, "TOO_MANY_FILES", "You have reached the upload limit for this application.");
  return createUpload({
    ownerType: "staff-application",
    ownerId: app.id,
    slot: input.slot,
    fileName: input.fileName,
    mime: input.mime,
    size: input.size,
  });
}

/**
 * Final submission. The declaration (step 9) arrives with the request; every step is then validated together.
 * On failure the error carries per-step issues and the first failing step so the form can jump to it.
 */
export async function submit(input: {
  id: string;
  token: string | undefined;
  data: unknown;
}): Promise<{ id: string; ref: string; name: string; role: string }> {
  const app = await loadWithAccess(input.id, input.token);
  assertEditable(app);

  const merged = { ...asData(app.data), declaration: input.data } as StaffApplicationData;
  const issues = applicationIssues(merged);
  const first = firstFailingStep(issues);
  if (first)
    throw new ApiError(422, "INCOMPLETE", "Some steps need attention before you can submit.", {
      firstStep: first,
      steps: issues,
    });

  const data = {
    ...asData(app.data),
    declaration: tidyDeclaration(FORM_SCHEMAS.declaration.parse(input.data)),
  };
  const name = applicantName(data);
  await db.$transaction(async (tx) => {
    const res = await tx.staffApplication.updateMany({
      where: { id: app.id, status: "DRAFT" },
      data: {
        status: "RECEIVED",
        submittedAt: new Date(),
        fullName: name,
        currentStep: STEPS.length,
        data: toJson(data),
      },
    });
    if (res.count === 0)
      throw new ApiError(409, "ALREADY_SUBMITTED", "This application has already been submitted.");
    await audit(
      {
        actor: null,
        action: "staff_application.submitted",
        entity: "StaffApplication",
        entityId: app.id,
        after: { ref: app.ref, vacancy: app.vacancy?.slug ?? null },
      },
      tx,
    );
  });

  const role = app.vacancy?.title ?? `a position at ${school.name}`;
  try {
    await sendTemplate({
      template: "staff-application-received",
      to: { email: app.email },
      data: { name, role, ref: app.ref },
      channels: ["EMAIL"],
      related: { type: "staff-application", id: app.id },
    });
  } catch (err) {
    console.error("staff-application confirmation email failed", err);
  }
  return { id: app.id, ref: app.ref, name, role };
}
