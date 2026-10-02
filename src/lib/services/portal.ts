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
        where: { student: { status: { in: ["ACTIVE", "PROSPECTIVE"] } } },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              boardingType: true,
              status: true,
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
  return {
    guardian,
    children: guardian?.students.map((s) => ({ ...s.student, relation: s.relation })) ?? [],
  };
}

export type PortalChild = Awaited<ReturnType<typeof portalContext>>["children"][number];

/** The child selected with `?child=` (default: eldest). A child that isn't theirs is a 404, not a leak. */
export async function selectChild(user: CurrentUser, childParam?: string) {
  const ctx = await portalContext(user);
  if (!ctx.guardian || ctx.children.length === 0) return { ...ctx, child: null };
  const child = childParam ? ctx.children.find((c) => c.id === childParam) : ctx.children[0];
  if (!child) notFound();
  return { ...ctx, child };
}

export async function createPortalRequest(
  user: CurrentUser,
  input: { studentId: string; kind: PortalRequestKind; payload: Record<string, unknown> },
) {
  const ctx = await portalContext(user);
  if (!ctx.guardian || !ctx.children.some((c) => c.id === input.studentId))
    throw new ApiError(403, "FORBIDDEN", "You can only send requests about your own children.");
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
