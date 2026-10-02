import "server-only";
import { z } from "zod";
import { Prisma, type Role, type StaffAppStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { cursorList, type ListParams } from "@/lib/crm/list";
import { formatDate } from "@/lib/dates";
import {
  BOARD_STAGES,
  canMoveStage,
  closingInstant,
  isBoardStage,
  moveInput,
  newStaffInput,
  openError,
  readData,
  readScorecard,
  safeguardingFlags,
  scorecardInput,
  scorecardTotal,
  stageNoteBody,
  staffContact,
  vacancyPatch,
  vacancyShape,
  type VacancyInput,
} from "./careers-admin-rules";

/**
 * Careers CRM: the applications pipeline, vacancies and the staff directory. Every function checks the permission
 * itself (server actions and API routes are public endpoints) and every change that matters writes an audit entry.
 */

type Actor = { id: string; role: Role };

const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);

// ─── Applications ────────────────────────────────────────────────────────────────────────────

export type ApplicationFilters = { q?: string; vacancyId?: string; status?: string };

/** Drafts never appear in the pipeline: they are applications the candidate has not submitted. */
export function applicationWhere(f: ApplicationFilters): Prisma.StaffApplicationWhereInput {
  const and: Prisma.StaffApplicationWhereInput[] = [];
  if (f.q?.trim()) {
    const contains = { contains: f.q.trim(), mode: "insensitive" as const };
    and.push({
      OR: [{ fullName: contains }, { email: contains }, { ref: contains }, { vacancy: { title: contains } }],
    });
  }
  return {
    status: isBoardStage(f.status) ? f.status : { not: "DRAFT" },
    ...(f.vacancyId ? { vacancyId: f.vacancyId } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

export const APPLICATION_SORTS = ["submittedAt", "score", "fullName", "status"];

const listSelect = {
  id: true,
  ref: true,
  email: true,
  fullName: true,
  status: true,
  score: true,
  submittedAt: true,
  data: true,
  vacancy: { select: { id: true, title: true } },
} satisfies Prisma.StaffApplicationSelect;
type ListRow = Prisma.StaffApplicationGetPayload<{ select: typeof listSelect }>;

export type ApplicationSummary = Omit<ListRow, "data"> & { flagged: boolean };

/** The big `data` Json stays on the server: the list only needs to know whether a safeguarding flag is raised. */
function summarise({ data, ...row }: ListRow): ApplicationSummary {
  return { ...row, flagged: safeguardingFlags(readData(data)).length > 0 };
}

export async function listApplications(actor: Actor, f: ApplicationFilters, p: ListParams) {
  assertCan(actor.role, "careers:read");
  const r = await cursorList<ListRow>(
    db.staffApplication,
    { where: applicationWhere(f), select: listSelect },
    p,
  );
  return { ...r, rows: r.rows.map(summarise) };
}

export const BOARD_PER_COLUMN = 40;

/** How many submitted applications sit in each stage (for the filters that apply). */
export async function stageCounts(actor: Actor, f: Pick<ApplicationFilters, "q" | "vacancyId">) {
  assertCan(actor.role, "careers:read");
  const rows = await db.staffApplication.groupBy({
    by: ["status"],
    where: applicationWhere(f),
    _count: true,
  });
  return Object.fromEntries(
    BOARD_STAGES.map((s) => [s, rows.find((r) => r.status === s)?._count ?? 0]),
  ) as Record<(typeof BOARD_STAGES)[number], number>;
}

/** Drafts are applications still being written; they are only counted, never listed. */
export async function draftCount(actor: Actor, vacancyId?: string) {
  assertCan(actor.role, "careers:read");
  return db.staffApplication.count({ where: { status: "DRAFT", ...(vacancyId ? { vacancyId } : {}) } });
}

/** The board: each stage's count and its most recent cards, plus how many drafts are still being written. */
export async function pipelineBoard(actor: Actor, f: Pick<ApplicationFilters, "q" | "vacancyId">) {
  assertCan(actor.role, "careers:read");
  const where = applicationWhere(f);
  const [counts, drafts, lists] = await Promise.all([
    stageCounts(actor, f),
    draftCount(actor, f.vacancyId),
    Promise.all(
      BOARD_STAGES.map((stage) =>
        db.staffApplication.findMany({
          where: { ...where, status: stage },
          select: listSelect,
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          take: BOARD_PER_COLUMN,
        }),
      ),
    ),
  ]);
  const columns = BOARD_STAGES.map((stage, i) => ({
    stage,
    count: counts[stage],
    cards: lists[i]!.map(summarise),
  }));
  return { columns, drafts, total: columns.reduce((a, c) => a + c.count, 0) };
}

export async function applicationFacets(actor: Actor) {
  assertCan(actor.role, "careers:read");
  return db.vacancy.findMany({
    select: { id: true, title: true },
    orderBy: [{ title: "asc" }],
  });
}

const detailInclude = {
  vacancy: { select: { id: true, title: true, department: true, slug: true } },
  notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.StaffApplicationInclude;

/** The full application with its notes, parsed scorecard and (if hired) whether they are already in the directory. */
export async function getApplication(actor: Actor, id: string) {
  assertCan(actor.role, "careers:read");
  const app = await db.staffApplication.findUnique({ where: { id }, include: detailInclude });
  if (!app) return null;
  const { data, scorecard, ...rest } = app;
  const staff = await db.staff.findFirst({
    where: { email: { equals: app.email.trim(), mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true },
  });
  return { ...rest, data: readData(data), scorecard: readScorecard(scorecard), staff };
}
export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getApplication>>>;

export async function moveStage(actor: Actor, id: string, to: string, reason?: string) {
  assertCan(actor.role, "careers:write");
  const input = moveInput.parse({ to, reason: reason || undefined });
  const app = await db.staffApplication.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!app) throw notFound("Application");
  const check = canMoveStage(app.status, input.to);
  if (!check.ok) throw new ApiError(409, "INVALID_TRANSITION", check.reason);
  await db.$transaction(async (tx) => {
    // Guards against two people moving the same application at once
    const moved = await tx.staffApplication.updateMany({
      where: { id, status: app.status },
      data: { status: input.to },
    });
    if (moved.count === 0)
      throw new ApiError(409, "CONFLICT", "Someone else just moved this application. Reload and try again.");
    await tx.staffApplicationNote.create({
      data: {
        applicationId: id,
        authorId: actor.id,
        body: stageNoteBody(app.status, input.to, input.reason),
      },
    });
    await audit(
      {
        actor,
        action: "staff_application.stage",
        entity: "StaffApplication",
        entityId: id,
        before: { status: app.status },
        after: { status: input.to },
        reason: input.reason,
      },
      tx,
    );
  });
  return { status: input.to as StaffAppStatus };
}

export async function saveScorecard(actor: Actor, id: string, input: unknown) {
  assertCan(actor.role, "careers:write");
  const card = scorecardInput.parse(input);
  const app = await db.staffApplication.findUnique({ where: { id }, select: { status: true, score: true } });
  if (!app) throw notFound("Application");
  if (app.status === "DRAFT") throw new ApiError(409, "NOT_SUBMITTED", "A draft cannot be scored yet");
  const who = await db.user.findUnique({ where: { id: actor.id }, select: { name: true } });
  const total = scorecardTotal(card);
  await db.$transaction(async (tx) => {
    await tx.staffApplication.update({
      where: { id },
      data: {
        score: total,
        scorecard: {
          ...card,
          scoredById: actor.id,
          scoredByName: who?.name ?? null,
          scoredAt: new Date().toISOString(),
        },
      },
    });
    await audit(
      {
        actor,
        action: "staff_application.score",
        entity: "StaffApplication",
        entityId: id,
        before: { score: app.score },
        after: { score: total },
      },
      tx,
    );
  });
  return { score: total };
}

const noteBody = z
  .string()
  .trim()
  .min(1, "Write a note first")
  .max(2000, "Keep the note under 2,000 characters");

export async function addNote(actor: Actor, id: string, body: unknown) {
  assertCan(actor.role, "careers:write");
  const text = noteBody.parse(body);
  const app = await db.staffApplication.findUnique({ where: { id }, select: { id: true } });
  if (!app) throw notFound("Application");
  return db.staffApplicationNote.create({ data: { applicationId: id, authorId: actor.id, body: text } });
}

/** Creates the Staff row for a hired applicant. The application's email is the identity: it cannot be added twice. */
export async function addToStaffDirectory(actor: Actor, id: string, input: unknown) {
  assertCan(actor.role, "careers:write");
  const d = newStaffInput.parse(input);
  const app = await db.staffApplication.findUnique({
    where: { id },
    select: { id: true, ref: true, status: true, email: true },
  });
  if (!app) throw notFound("Application");
  if (app.status !== "HIRED")
    throw new ApiError(409, "NOT_HIRED", "Only a hired applicant can be added to the staff directory");
  const email = app.email.trim().toLowerCase();
  const duplicate = new ApiError(
    409,
    "DUPLICATE_STAFF",
    "Someone with this email is already in the staff directory",
  );
  if (
    await db.staff.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    })
  )
    throw duplicate;
  try {
    return await db.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          firstName: d.firstName,
          lastName: d.lastName,
          email,
          phone: d.phone || null,
          designation: d.designation,
          department: d.department,
          joinedOn: new Date(`${d.joinedOn}T00:00:00Z`),
        },
      });
      await audit(
        {
          actor,
          action: "staff.create",
          entity: "Staff",
          entityId: staff.id,
          after: { applicationRef: app.ref, designation: d.designation, department: d.department },
          reason: `Hired from application ${app.ref}`,
        },
        tx,
      );
      return staff;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw duplicate;
    throw e;
  }
}

/** Loads an application for the PDF download. Exporting a candidate's personal data is audited. */
export async function applicationForPdf(actor: Actor, id: string) {
  assertCan(actor.role, "careers:read");
  const app = await db.staffApplication.findUnique({
    where: { id },
    include: { vacancy: { select: { title: true } } },
  });
  if (!app) throw notFound("Application");
  await audit({
    actor,
    action: "staff_application.export_pdf",
    entity: "StaffApplication",
    entityId: id,
    after: { ref: app.ref },
    reason: "PDF download",
  });
  return {
    ref: app.ref,
    status: app.status,
    email: app.email,
    vacancyTitle: app.vacancy?.title ?? null,
    submittedAt: app.submittedAt,
    data: readData(app.data),
    scorecard: readScorecard(app.scorecard),
  };
}

// ─── Vacancies ───────────────────────────────────────────────────────────────────────────────

export type VacancyFilters = { q?: string; status?: string };

const STATUS_RANK = { OPEN: 0, DRAFT: 1, CLOSED: 2 } as const;

export async function listVacancies(actor: Actor, f: VacancyFilters = {}) {
  assertCan(actor.role, "careers:read");
  const rows = await db.vacancy.findMany({
    where: {
      ...(f.status === "OPEN" || f.status === "DRAFT" || f.status === "CLOSED" ? { status: f.status } : {}),
      ...(f.q?.trim()
        ? {
            OR: [
              { title: { contains: f.q.trim(), mode: "insensitive" } },
              { department: { contains: f.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { applications: true } } },
    take: 200,
  });
  const submitted = await db.staffApplication.groupBy({
    by: ["vacancyId"],
    where: { vacancyId: { in: rows.map((r) => r.id) }, status: { not: "DRAFT" } },
    _count: true,
  });
  return rows
    .map((r) => ({
      ...r,
      totalApplications: r._count.applications,
      submittedApplications: submitted.find((s) => s.vacancyId === r.id)?._count ?? 0,
    }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        a.closesAt.getTime() - b.closesAt.getTime() ||
        a.title.localeCompare(b.title),
    );
}

export async function getVacancy(actor: Actor, id: string) {
  assertCan(actor.role, "careers:read");
  const v = await db.vacancy.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!v) return null;
  return { ...v, totalApplications: v._count.applications };
}

export async function vacancyDepartments(actor: Actor) {
  assertCan(actor.role, "careers:read");
  const rows = await db.vacancy.groupBy({ by: ["department"], orderBy: { department: "asc" } });
  return rows.map((r) => r.department);
}

const slugTaken = () =>
  new ApiError(409, "SLUG_TAKEN", "Another vacancy already uses this web address. Choose a different one.");

export async function createVacancy(actor: Actor, input: unknown) {
  assertCan(actor.role, "careers:write");
  const v = vacancyShape.parse(input);
  const problem = openError(v, new Date());
  if (problem) throw new ApiError(422, "CLOSING_DATE_PAST", problem);
  if (await db.vacancy.findUnique({ where: { slug: v.slug }, select: { id: true } })) throw slugTaken();
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.vacancy.create({ data: { ...v, closesAt: closingInstant(v.closesAt) } });
      await audit(
        {
          actor,
          action: "vacancy.create",
          entity: "Vacancy",
          entityId: created.id,
          after: { title: v.title, slug: v.slug, status: v.status, closesAt: v.closesAt },
        },
        tx,
      );
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw slugTaken();
    throw e;
  }
}

const AUDITED_VACANCY_FIELDS = [
  "title",
  "slug",
  "department",
  "employment",
  "location",
  "status",
  "closesAt",
] as const;

/** Applies a partial change on top of the stored vacancy and validates the result as a whole. */
export async function updateVacancy(actor: Actor, id: string, patch: unknown) {
  assertCan(actor.role, "careers:write");
  const changes = vacancyPatch.parse(patch);
  const before = await db.vacancy.findUnique({ where: { id } });
  if (!before) throw notFound("Vacancy");
  const beforeInput: VacancyInput = {
    title: before.title,
    slug: before.slug,
    department: before.department,
    employment: before.employment,
    location: before.location,
    summary: before.summary,
    description: before.description,
    requirements: before.requirements,
    closesAt: formatDate(before.closesAt, "yyyy-MM-dd"),
    status: before.status,
  };
  // Stored values predate this validation (the seed, older edits), so only re-check what the person is changing.
  const merged = vacancyShape.parse({ ...beforeInput, ...changes });
  if (changes.status !== undefined || changes.closesAt !== undefined) {
    const problem = openError(merged, new Date());
    if (problem) throw new ApiError(422, "CLOSING_DATE_PAST", problem);
  }
  if (
    merged.slug !== before.slug &&
    (await db.vacancy.findUnique({ where: { slug: merged.slug }, select: { id: true } }))
  )
    throw slugTaken();
  const closesAt =
    merged.closesAt === beforeInput.closesAt ? before.closesAt : closingInstant(merged.closesAt);
  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.vacancy.update({ where: { id }, data: { ...merged, closesAt } });
      const changed = AUDITED_VACANCY_FIELDS.filter((k) => merged[k] !== beforeInput[k]);
      if (
        changed.length ||
        merged.summary !== beforeInput.summary ||
        merged.description !== beforeInput.description
      )
        await audit(
          {
            actor,
            action: "vacancy.update",
            entity: "Vacancy",
            entityId: id,
            before: Object.fromEntries(changed.map((k) => [k, beforeInput[k]])),
            after: Object.fromEntries(changed.map((k) => [k, merged[k]])),
          },
          tx,
        );
      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw slugTaken();
    throw e;
  }
}

export async function deleteVacancy(actor: Actor, id: string) {
  assertCan(actor.role, "careers:write");
  const v = await db.vacancy.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, _count: { select: { applications: true } } },
  });
  if (!v) throw notFound("Vacancy");
  const blocked = new ApiError(
    409,
    "HAS_APPLICATIONS",
    "This vacancy has applications, so it cannot be deleted. Close it instead.",
  );
  if (v._count.applications > 0) throw blocked;
  await db.$transaction(async (tx) => {
    const gone = await tx.vacancy.deleteMany({ where: { id, applications: { none: {} } } });
    if (gone.count === 0) throw blocked;
    await audit(
      {
        actor,
        action: "vacancy.delete",
        entity: "Vacancy",
        entityId: id,
        before: { title: v.title, slug: v.slug },
      },
      tx,
    );
  });
}

// ─── Staff directory ─────────────────────────────────────────────────────────────────────────

export type StaffFilters = { q?: string; department?: string; designation?: string; status?: string };
export const STAFF_SORTS = ["lastName", "firstName", "department", "designation", "joinedOn"];

const staffInclude = {
  subjects: { select: { name: true }, orderBy: { name: "asc" } },
  user: { select: { role: true } },
} satisfies Prisma.StaffInclude;
export type StaffRow = Prisma.StaffGetPayload<{ include: typeof staffInclude }>;

export function staffWhere(f: StaffFilters): Prisma.StaffWhereInput {
  const contains = f.q?.trim() ? { contains: f.q.trim(), mode: "insensitive" as const } : null;
  return {
    ...(f.department ? { department: f.department } : {}),
    ...(f.designation ? { designation: f.designation } : {}),
    ...(f.status === "active" ? { active: true } : f.status === "inactive" ? { active: false } : {}),
    ...(contains
      ? {
          OR: [
            { firstName: contains },
            { lastName: contains },
            { email: contains },
            { designation: contains },
            { department: contains },
          ],
        }
      : {}),
  };
}

export async function listStaff(actor: Actor, f: StaffFilters, p: ListParams) {
  assertCan(actor.role, "careers:read");
  return cursorList<StaffRow>(db.staff, { where: staffWhere(f), include: staffInclude }, p);
}

export async function staffFacets(actor: Actor) {
  assertCan(actor.role, "careers:read");
  const [departments, designations] = await Promise.all([
    db.staff.groupBy({ by: ["department"], orderBy: { department: "asc" } }),
    db.staff.groupBy({ by: ["designation"], orderBy: { designation: "asc" } }),
  ]);
  return {
    departments: departments.map((d) => d.department),
    designations: designations.map((d) => d.designation),
  };
}

/** Designation, department and phone are the only fields HR edits here; names and email are the person's identity. */
export async function updateStaffContact(actor: Actor, id: string, input: unknown) {
  assertCan(actor.role, "careers:write");
  const d = staffContact.parse(input);
  const before = await db.staff.findUnique({ where: { id } });
  if (!before) throw notFound("Staff member");
  const phone = d.phone || null;
  const fields = (
    [
      ["designation", before.designation !== d.designation],
      ["department", before.department !== d.department],
      ["phone", (before.phone ?? null) !== phone],
    ] as const
  )
    .filter(([, changed]) => changed)
    .map(([k]) => k);
  await db.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: { designation: d.designation, department: d.department, phone },
    });
    // Phone numbers are personal data: the log records that the field changed, not its value
    if (fields.length)
      await audit(
        {
          actor,
          action: "staff.update",
          entity: "Staff",
          entityId: id,
          before: { designation: before.designation, department: before.department },
          after: { designation: d.designation, department: d.department, fields },
        },
        tx,
      );
  });
}
