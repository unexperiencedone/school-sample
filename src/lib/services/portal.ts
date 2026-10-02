import "server-only";
import { notFound } from "next/navigation";
import type { PortalRequestKind } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * The parent portal's view of the world: a signed-in guardian sees only the children linked to them. Every
 * query below is scoped through `guardianId` — a child id from the URL is checked, never trusted.
 */

export async function portalContext(user: CurrentUser) {
  const guardian = await db.guardian.findUnique({
    where: { userId: user.id },
    include: {
      students: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              boardingType: true,
              status: true,
              leftOn: true,
              class: { select: { name: true, order: true } },
              section: { select: { name: true } },
              house: { select: { name: true, colour: true } },
            },
          },
        },
        orderBy: { student: { dob: "asc" } },
      },
    },
  });
  // Children who have left stay visible (fees, receipts and documents outlive enrolment) but are read-only.
  const children =
    guardian?.students.map((s) => ({
      ...s.student,
      relation: s.relation,
      onRoll: s.student.status === "ACTIVE" || s.student.status === "PROSPECTIVE",
    })) ?? [];
  children.sort((a, b) => Number(b.onRoll) - Number(a.onRoll));
  return { guardian, children };
}

/** Circulars this family may read: those for everyone, for boarders (if any child boards) or for a child's class. */
export async function circularsFor(user: CurrentUser, take: number) {
  const { children } = await portalContext(user);
  const classIds = await db.student.findMany({
    where: { id: { in: children.map((c) => c.id) } },
    select: { classId: true },
  });
  const audiences = [
    "ALL",
    ...(children.some((c) => c.boardingType !== "DAY") ? ["BOARDERS"] : []),
    ...classIds.map((c) => `CLASS:${c.classId}`),
  ];
  return db.announcement.findMany({
    where: {
      kind: "CIRCULAR",
      active: true,
      audience: { in: audiences },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { publishedAt: "desc" },
    take,
  });
}

export type PortalChild = Awaited<ReturnType<typeof portalContext>>["children"][number];

/** The child selected with `?child=` (default: eldest). A child that isn't theirs is a 404, not a leak. */
export async function selectChild(user: CurrentUser, childParam?: string) {
  const ctx = await portalContext(user);
  if (!ctx.guardian || ctx.children.length === 0) return { ...ctx, child: null };
  const child = childParam ? ctx.children.find((c) => c.id === childParam) : ctx.children[0]; // on-roll first
  if (!child) notFound();
  return { ...ctx, child };
}

export async function createPortalRequest(
  user: CurrentUser,
  input: { studentId: string; kind: PortalRequestKind; payload: Record<string, unknown> },
) {
  const ctx = await portalContext(user);
  const child = ctx.children.find((c) => c.id === input.studentId);
  if (!ctx.guardian || !child)
    throw new ApiError(403, "FORBIDDEN", "You can only send requests about your own children.");
  if (!child.onRoll)
    throw new ApiError(409, "LEFT_SCHOOL", "She has left the school — please contact the office directly.");
  const open = await db.portalRequest.count({
    where: { studentId: input.studentId, kind: input.kind, status: { in: ["OPEN", "IN_REVIEW"] } },
  });
  if (open >= 3)
    throw new ApiError(
      429,
      "TOO_MANY",
      "You already have open requests of this kind — the school will reply soon.",
    );
  const r = await db.portalRequest.create({
    data: {
      studentId: input.studentId,
      guardianId: ctx.guardian.id,
      kind: input.kind,
      payload: input.payload as never,
    },
  });
  await audit({
    actor: { id: user.id, role: user.role },
    action: "portal_request.create",
    entity: "PortalRequest",
    entityId: r.id,
    after: { kind: input.kind },
  });
  return r;
}

/** DPDP: a guardian controls their own communication consent; each change is recorded. */
export async function updateConsent(
  user: CurrentUser,
  consent: { email: boolean; whatsapp: boolean; sms: boolean },
) {
  const ctx = await portalContext(user);
  if (!ctx.guardian) throw new ApiError(404, "NOT_FOUND", "No guardian record");
  const before = {
    email: ctx.guardian.emailOptIn,
    whatsapp: ctx.guardian.whatsappOptIn,
    sms: ctx.guardian.smsOptIn,
  };
  await db.guardian.update({
    where: { id: ctx.guardian.id },
    data: { emailOptIn: consent.email, whatsappOptIn: consent.whatsapp, smsOptIn: consent.sms },
  });
  await audit({
    actor: { id: user.id, role: user.role },
    action: "consent.update",
    entity: "Guardian",
    entityId: ctx.guardian.id,
    before,
    after: consent,
  });
}

export async function requestDataExport(user: CurrentUser, kind: "EXPORT" | "DELETION", notes: string) {
  const existing = await db.dataRequest.findFirst({
    where: { subjectEmail: user.email, kind, status: "OPEN" },
  });
  if (existing) return existing;
  const r = await db.dataRequest.create({
    data: { kind, subjectEmail: user.email, notes: notes.slice(0, 500) },
  });
  await audit({
    actor: { id: user.id, role: user.role },
    action: `privacy.${kind.toLowerCase()}_request`,
    entity: "DataRequest",
    entityId: r.id,
  });
  return r;
}
