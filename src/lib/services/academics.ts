import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

type Actor = { id: string; role: Role };

export async function updateSection(
  actor: Actor,
  id: string,
  input: { capacity: number; classTeacherId: string | null; room: string | null },
) {
  assertCan(actor.role, "academics:write");
  const before = await db.section.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { students: true } } },
  });
  if (input.capacity < before._count.students)
    throw new ApiError(422, "VALIDATION", `${before._count.students} pupils are already in this section.`);
  const after = await db.section.update({ where: { id }, data: input });
  await audit({ actor, action: "section.update", entity: "Section", entityId: id, before, after });
}

export async function updateTerm(
  actor: Actor,
  id: string,
  input: { name: string; startDate: Date; endDate: Date },
) {
  assertCan(actor.role, "academics:write");
  if (input.endDate <= input.startDate)
    throw new ApiError(422, "VALIDATION", "A term must end after it starts.");
  const term = await db.term.findUniqueOrThrow({ where: { id }, include: { year: true } });
  if (input.startDate < term.year.startDate || input.endDate > term.year.endDate)
    throw new ApiError(422, "VALIDATION", `Terms must fall within ${term.year.name}.`);
  const after = await db.term.update({ where: { id }, data: input });
  await audit({ actor, action: "term.update", entity: "Term", entityId: id, before: term, after });
}

/** Switches the current academic year — dashboards, fees and the roll all follow it. Super admin only. */
export async function setCurrentYear(actor: Actor, yearId: string, reason: string) {
  assertCan(actor.role, "settings:write");
  const before = await db.academicYear.findFirst({ where: { isCurrent: true } });
  const target = await db.academicYear.findUniqueOrThrow({ where: { id: yearId } });
  if (before && target.startDate > before.startDate) {
    // Promotion plans from the *current* year, so it has to run first; otherwise the roll would look empty.
    const unplaced = await db.student.count({
      where: { status: "ACTIVE", section: { yearId: before.id } },
    });
    if (unplaced > 0)
      throw new ApiError(
        409,
        "PROMOTE_FIRST",
        `${unplaced} pupils are still placed in ${before.name}. Run the year-end promotion first (Students → Promotion), then switch the year.`,
      );
  }
  await db.$transaction([
    db.academicYear.updateMany({ data: { isCurrent: false } }),
    db.academicYear.update({ where: { id: yearId }, data: { isCurrent: true } }),
  ]);
  await audit({
    actor,
    action: "academic_year.switch",
    entity: "AcademicYear",
    entityId: yearId,
    before: { current: before?.name },
    reason,
  });
}
