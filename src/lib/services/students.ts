import "server-only";
import type { BoardingType, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ageOn } from "@/lib/dates";

/**
 * Students: directory, profile, edits, withdrawal and year-end promotion. Medical details are a separate,
 * permissioned read (`students:medical`) and every view of them is audit-logged.
 */

type Actor = { id: string; role: Role };

export type DirectoryFilters = {
  q?: string;
  classId?: string;
  sectionId?: string;
  houseId?: string;
  boarding?: string;
  status?: string;
};

export function directoryWhere(f: DirectoryFilters, currentYearId: string): Prisma.StudentWhereInput {
  const statuses = ["ACTIVE", "PROSPECTIVE", "WITHDRAWN", "TRANSFERRED", "ALUMNA"];
  return {
    ...(f.status && statuses.includes(f.status)
      ? { status: f.status as Prisma.StudentWhereInput["status"] }
      : { status: "ACTIVE", section: { yearId: currentYearId } }),
    ...(f.classId ? { classId: f.classId } : {}),
    ...(f.sectionId ? { sectionId: f.sectionId } : {}),
    ...(f.houseId ? { houseId: f.houseId } : {}),
    ...(f.boarding && ["FULL", "FLEXI", "DAY"].includes(f.boarding)
      ? { boardingType: f.boarding as BoardingType }
      : {}),
    ...(f.q
      ? {
          OR: [
            { firstName: { contains: f.q, mode: "insensitive" } },
            { lastName: { contains: f.q, mode: "insensitive" } },
            { admissionNo: { contains: f.q, mode: "insensitive" } },
            { guardians: { some: { guardian: { name: { contains: f.q, mode: "insensitive" } } } } },
            { guardians: { some: { guardian: { phone: { contains: f.q } } } } },
          ],
        }
      : {}),
  };
}

export const directoryInclude = {
  class: { select: { name: true, order: true } },
  section: { select: { name: true } },
  house: { select: { name: true, colour: true } },
  guardians: { where: { isPrimary: true }, include: { guardian: { select: { name: true, phone: true } } } },
} satisfies Prisma.StudentInclude;

/** Everything on a pupil's profile except medical details. */
export async function studentProfile(id: string) {
  const s = await db.student.findUnique({
    where: { id },
    include: {
      class: true,
      section: { include: { classTeacher: { select: { firstName: true, lastName: true } } } },
      house: true,
      application: { select: { id: true, ref: true, documents: true } },
      guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      history: {
        include: { year: true, class: true, section: true },
        orderBy: { year: { startDate: "desc" } },
      },
      invoices: {
        include: { year: true, instalments: { orderBy: { seq: "asc" } } },
        orderBy: { issuedAt: "desc" },
      },
      wallet: true,
      imprest: { select: { kind: true, amountPaise: true } },
      concessions: { include: { concession: true, year: true } },
      requests: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!s) return null;
  const guardianIds = s.guardians.map((g) => g.guardianId);
  const siblings = guardianIds.length
    ? await db.student.findMany({
        where: { id: { not: s.id }, guardians: { some: { guardianId: { in: guardianIds } } } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          class: { select: { name: true } },
        },
      })
    : [];
  const imprestBalance = s.imprest.reduce(
    (a, e) => a + (e.kind === "CREDIT" ? e.amountPaise : -e.amountPaise),
    0,
  );
  const walletBalance = s.wallet.reduce((a, w) => a + w.amountPaise, 0);
  const outstanding = s.invoices
    .filter((i) => !["VOID", "WAIVED", "PAID"].includes(i.status))
    .reduce((a, i) => a + Math.max(0, i.totalPaise + i.lateFeePaise - i.paidPaise), 0);
  return { ...s, siblings, imprestBalance, walletBalance, outstanding, age: ageOn(s.dob, new Date()) };
}

/** Medical record — only for roles with `students:medical`; the read itself is audit-logged. */
export async function readMedical(actor: Actor, studentId: string) {
  assertCan(actor.role, "students:medical");
  const record = await db.medicalRecord.findUnique({ where: { studentId } });
  await audit({ actor, action: "medical.view", entity: "Student", entityId: studentId });
  return record;
}

export async function updateMedical(
  actor: Actor,
  studentId: string,
  data: {
    bloodGroup?: string | null;
    allergies?: string | null;
    conditions?: string | null;
    medications?: string | null;
    doctorName?: string | null;
    doctorPhone?: string | null;
    notes?: string | null;
  },
) {
  assertCan(actor.role, "students:medical");
  const before = await db.medicalRecord.findUnique({ where: { studentId } });
  await db.medicalRecord.upsert({ where: { studentId }, create: { studentId, ...data }, update: data });
  // Medical changes are logged without the values themselves (sensitive personal data stays in one place)
  await audit({
    actor,
    action: "medical.update",
    entity: "Student",
    entityId: studentId,
    after: {
      fields: Object.keys(data).filter(
        (k) => (before as Record<string, unknown> | null)?.[k] !== (data as Record<string, unknown>)[k],
      ),
    },
  });
}

export async function updateStudent(
  actor: Actor,
  id: string,
  data: {
    firstName: string;
    lastName: string;
    houseId: string | null;
    sectionId: string | null;
    boardingType: BoardingType;
  },
  reason: string,
) {
  assertCan(actor.role, "students:write");
  const before = await db.student.findUniqueOrThrow({ where: { id } });
  if (data.sectionId) {
    const section = await db.section.findUniqueOrThrow({
      where: { id: data.sectionId },
      include: { _count: { select: { students: true } } },
    });
    if (section.classId !== before.classId)
      throw new ApiError(422, "VALIDATION", "That section belongs to another class.");
    if (section.id !== before.sectionId && section._count.students >= section.capacity)
      throw new ApiError(409, "FULL", "That section is full.");
  }
  const after = await db.student.update({ where: { id }, data });
  await audit({
    actor,
    action: "student.update",
    entity: "Student",
    entityId: id,
    before: {
      firstName: before.firstName,
      lastName: before.lastName,
      houseId: before.houseId,
      sectionId: before.sectionId,
      boardingType: before.boardingType,
    },
    after: data,
    reason,
  });
  return after;
}

/**
 * Records a withdrawal or transfer. The seat is released and the pupil leaves the roll; fee settlement (refund
 * quote, closing the invoice) is a separate, approved finance step — this never moves money.
 */
export async function withdrawStudent(
  actor: Actor,
  id: string,
  input: { kind: "WITHDRAWN" | "TRANSFERRED"; leftOn: Date; reason: string; destination?: string | null },
) {
  assertCan(actor.role, "students:write");
  if (input.reason.trim().length < 5) throw new ApiError(422, "VALIDATION", "Give a reason.");
  const s = await db.student.findUniqueOrThrow({ where: { id } });
  if (s.status !== "ACTIVE" && s.status !== "PROSPECTIVE")
    throw new ApiError(409, "NOT_ON_ROLL", "This pupil is not on the roll.");
  await db.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: { status: input.kind, leftOn: input.leftOn, sectionId: null },
    });
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
    if (year)
      await tx.studentClassHistory.updateMany({
        where: { studentId: id, yearId: year.id },
        data: { outcome: "LEFT" },
      });
    await audit(
      {
        actor,
        action: input.kind === "WITHDRAWN" ? "student.withdraw" : "student.transfer",
        entity: "Student",
        entityId: id,
        before: { status: s.status, sectionId: s.sectionId },
        after: { status: input.kind, leftOn: input.leftOn, destination: input.destination },
        reason: input.reason,
      },
      tx,
    );
  });
}

/* ───────────────────────────── Promotion ───────────────────────────── */

export type PromotionRow = {
  studentId: string;
  name: string;
  admissionNo: string;
  fromClass: string;
  fromSection: string | null;
  toClass: string | null; // null = leaves (Year 13 → alumna)
  toSectionId: string | null;
  toSection: string | null;
  note?: string;
};

/**
 * Plans moving every pupil on the current roll into the next academic year: same section letter in the next
 * class (spilling into the least-full section when full), Year 13 leavers become alumnae. Pupils already placed
 * in the next year are skipped, so running it twice is harmless.
 */
export async function planPromotion() {
  const years = await db.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const current = years.find((y) => y.isCurrent);
  const next = current && years.find((y) => y.startDate > current.startDate);
  if (!current || !next)
    throw new ApiError(409, "NO_NEXT_YEAR", "Create next year's academic year and sections first.");
  const [classes, students, nextSections, done] = await Promise.all([
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.student.findMany({
      where: { status: "ACTIVE", section: { yearId: current.id } },
      include: { class: true, section: true },
      orderBy: [{ class: { order: "asc" } }, { section: { name: "asc" } }, { lastName: "asc" }],
    }),
    db.section.findMany({ where: { yearId: next.id }, include: { _count: { select: { students: true } } } }),
    db.studentClassHistory.findMany({ where: { yearId: next.id }, select: { studentId: true } }),
  ]);
  const placed = new Set(done.map((d) => d.studentId));
  const fill = new Map(nextSections.map((s) => [s.id, s._count.students]));
  const rows: PromotionRow[] = [];
  let skipped = 0;
  for (const s of students) {
    if (placed.has(s.id)) {
      skipped++;
      continue;
    }
    const nextClass = classes.find((c) => c.order === s.class.order + 1);
    const base = {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNo: s.admissionNo,
      fromClass: s.class.name,
      fromSection: s.section?.name ?? null,
    };
    if (!nextClass) {
      rows.push({
        ...base,
        toClass: null,
        toSectionId: null,
        toSection: null,
        note: "Leaves — becomes an alumna",
      });
      continue;
    }
    const options = nextSections
      .filter((x) => x.classId === nextClass.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const same = options.find((o) => o.name === s.section?.name);
    const target =
      same && fill.get(same.id)! < same.capacity
        ? same
        : [...options].sort((a, b) => fill.get(a.id)! / a.capacity - fill.get(b.id)! / b.capacity)[0];
    if (!target) {
      rows.push({
        ...base,
        toClass: nextClass.name,
        toSectionId: null,
        toSection: null,
        note: "No section set up for next year",
      });
      continue;
    }
    fill.set(target.id, fill.get(target.id)! + 1);
    rows.push({
      ...base,
      toClass: nextClass.name,
      toSectionId: target.id,
      toSection: target.name,
      note:
        fill.get(target.id)! > target.capacity
          ? "Over capacity"
          : target.name !== s.section?.name
            ? "Moved to another section"
            : undefined,
    });
  }
  return { current, next, rows, skipped };
}

/** Executes the plan in one transaction (a person confirms the preview first). */
export async function runPromotion(actor: Actor, excluded: string[], reason: string) {
  assertCan(actor.role, "students:promote");
  const plan = await planPromotion();
  const rows = plan.rows.filter((r) => !excluded.includes(r.studentId) && (r.toSectionId || !r.toClass));
  await db.$transaction(
    async (tx) => {
      for (const r of rows) {
        await tx.studentClassHistory.updateMany({
          where: { studentId: r.studentId, yearId: plan.current.id },
          data: { outcome: r.toClass ? "PROMOTED" : "LEFT" },
        });
        if (!r.toClass) {
          await tx.student.update({
            where: { id: r.studentId },
            data: { status: "ALUMNA", leftOn: plan.current.endDate, sectionId: null },
          });
          continue;
        }
        const section = await tx.section.findUniqueOrThrow({ where: { id: r.toSectionId! } });
        await tx.student.update({
          where: { id: r.studentId },
          data: { classId: section.classId, sectionId: section.id },
        });
        await tx.studentClassHistory.create({
          data: {
            studentId: r.studentId,
            yearId: plan.next.id,
            classId: section.classId,
            sectionId: section.id,
          },
        });
      }
      await audit(
        {
          actor,
          action: "students.promote",
          entity: "AcademicYear",
          entityId: plan.next.id,
          after: {
            promoted: rows.filter((r) => r.toClass).length,
            leavers: rows.filter((r) => !r.toClass).length,
            excluded: excluded.length,
          },
          reason,
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return { moved: rows.length };
}

/* ───────────────────────────── Portal requests ───────────────────────────── */

export async function respondToRequest(
  actor: Actor,
  id: string,
  input: { status: "IN_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED"; response: string },
) {
  if (!can(actor.role, "students:write") && !can(actor.role, "fees:read"))
    assertCan(actor.role, "students:write");
  const before = await db.portalRequest.findUniqueOrThrow({ where: { id } });
  const after = await db.portalRequest.update({
    where: { id },
    data: { status: input.status, response: input.response.trim() || null, handledById: actor.id },
  });
  await audit({
    actor,
    action: "portal_request.respond",
    entity: "PortalRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: input.status },
    reason: input.response,
  });
  return after;
}
