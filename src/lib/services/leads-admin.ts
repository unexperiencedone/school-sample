import "server-only";
import type { LeadStatus, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { asArray, cursorList, dateRange, type ListParams } from "@/lib/crm/list";
import { emitLeadEvent } from "@/lib/notify";
import { LEAD_STATUS_FLOW, LEAD_STATUS_LABEL } from "./leads";

type Actor = { id: string; role: Role };
export type LeadFilters = {
  q?: string;
  status?: string;
  source?: string;
  classApplying?: string;
  assignee?: string;
  type?: string;
  from?: string;
  to?: string;
  utmSource?: string;
};

export const LEAD_SORTS = ["createdAt", "parentName", "status", "nextFollowUpAt", "classApplying"];

export function leadWhere(f: LeadFilters, me?: string): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { mergedIntoId: null };
  const and: Prisma.LeadWhereInput[] = [];
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { parentName: contains },
        { email: contains },
        { phone: { contains: f.q.replace(/\D/g, "") || f.q } },
        { childName: contains },
      ],
    });
  }
  const statuses = asArray(f.status).filter((s): s is LeadStatus =>
    (LEAD_STATUS_FLOW as string[]).includes(s),
  );
  if (statuses.length) where.status = { in: statuses };
  if (f.source) where.source = f.source;
  if (f.classApplying) where.classApplying = f.classApplying;
  if (f.type === "ENQUIRY" || f.type === "TOUR") where.type = f.type;
  if (f.utmSource) where.utmSource = f.utmSource === "(none)" ? null : f.utmSource;
  if (f.assignee === "me" && me) where.assignedToId = me;
  else if (f.assignee === "none") where.assignedToId = null;
  else if (f.assignee) where.assignedToId = f.assignee;
  const created = dateRange(f.from, f.to);
  if (created) where.createdAt = created;
  if (and.length) where.AND = and;
  return where;
}

const leadListInclude = {
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { bookings: true } },
} satisfies Prisma.LeadInclude;
export type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadListInclude }>;

export function listLeads(f: LeadFilters, p: ListParams, me: string) {
  return cursorList<LeadRow>(db.lead, { where: leadWhere(f, me), include: leadListInclude }, p);
}

export function assignableStaff() {
  return db.user.findMany({
    where: { active: true, role: { in: ["ADMISSIONS", "PRINCIPAL", "SUPER_ADMIN"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function leadFacets() {
  const [sources, classes, utm] = await Promise.all([
    db.lead.groupBy({ by: ["source"], _count: true, orderBy: { source: "asc" } }),
    db.lead.groupBy({ by: ["classApplying"], _count: true }),
    db.lead.groupBy({ by: ["utmSource"], _count: true }),
  ]);
  return {
    sources: sources.map((s) => s.source),
    classes: classes.map((c) => c.classApplying),
    utm: utm.map((u) => u.utmSource ?? "(none)"),
  };
}

export async function updateLead(
  actor: Actor,
  id: string,
  patch: {
    status?: LeadStatus;
    assignedToId?: string | null;
    nextFollowUpAt?: Date | null;
    lostReason?: string | null;
  },
) {
  const before = await db.lead.findUniqueOrThrow({ where: { id } });
  if (patch.status === "LOST" && !patch.lostReason && !before.lostReason)
    throw new ApiError(422, "REASON_REQUIRED", "Please give a reason when marking a lead as lost.");
  const activities: Prisma.LeadActivityCreateWithoutLeadInput[] = [];
  if (patch.status && patch.status !== before.status)
    activities.push({
      kind: "STATUS",
      body: `${LEAD_STATUS_LABEL[before.status]} → ${LEAD_STATUS_LABEL[patch.status]}${patch.lostReason ? ` (${patch.lostReason})` : ""}`,
      actor: { connect: { id: actor.id } },
    });
  if (patch.assignedToId !== undefined && patch.assignedToId !== before.assignedToId) {
    const who = patch.assignedToId
      ? (await db.user.findUnique({ where: { id: patch.assignedToId } }))?.name
      : "nobody";
    activities.push({ kind: "ASSIGN", body: `Assigned to ${who}`, actor: { connect: { id: actor.id } } });
  }
  if (patch.nextFollowUpAt !== undefined)
    activities.push({
      kind: "NOTE",
      body: patch.nextFollowUpAt
        ? `Follow-up set for ${patch.nextFollowUpAt.toISOString().slice(0, 10)}`
        : "Follow-up cleared",
      actor: { connect: { id: actor.id } },
    });
  const lead = await db.lead.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.assignedToId !== undefined ? { assignedToId: patch.assignedToId } : {}),
      ...(patch.nextFollowUpAt !== undefined ? { nextFollowUpAt: patch.nextFollowUpAt } : {}),
      ...(patch.lostReason !== undefined ? { lostReason: patch.lostReason } : {}),
      activities: { create: activities },
    },
  });
  if (patch.status && patch.status !== before.status)
    await emitLeadEvent("lead.status_changed", { leadId: id, status: patch.status });
  return lead;
}

export async function addLeadNote(
  actor: Actor,
  leadId: string,
  body: string,
  kind: "NOTE" | "CALL" | "EMAIL" = "NOTE",
) {
  return db.leadActivity.create({ data: { leadId, actorId: actor.id, kind, body } });
}

export async function addReminder(
  actor: Actor,
  leadId: string,
  title: string,
  dueAt: Date,
  assignedToId?: string,
) {
  await db.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: dueAt } });
  return db.reminder.create({ data: { leadId, title, dueAt, assignedToId: assignedToId ?? actor.id } });
}

export async function bulkUpdateLeads(
  actor: Actor,
  ids: string[],
  patch: { status?: LeadStatus; assignedToId?: string | null },
) {
  if (ids.length === 0 || ids.length > 500)
    throw new ApiError(422, "BAD_SELECTION", "Select between 1 and 500 leads.");
  if (patch.status === "LOST")
    throw new ApiError(422, "REASON_REQUIRED", "Mark leads as lost one at a time, with a reason.");
  for (const id of ids) await updateLead(actor, id, patch);
  await audit({ actor, action: "lead.bulk_update", entity: "Lead", after: { ids, ...patch } });
  return ids.length;
}

/** Merges duplicates into `keepId`: activities, bookings, reminders and applications move; the others are marked merged. */
export async function mergeLeads(actor: Actor, keepId: string, mergeIds: string[]) {
  const ids = mergeIds.filter((id) => id !== keepId);
  if (!ids.length) throw new ApiError(422, "NOTHING_TO_MERGE", "Choose at least one other lead.");
  await db.$transaction(async (tx) => {
    const keep = await tx.lead.findUniqueOrThrow({ where: { id: keepId } });
    const others = await tx.lead.findMany({ where: { id: { in: ids }, mergedIntoId: null } });
    await tx.leadActivity.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    await tx.tourBooking.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    await tx.reminder.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    await tx.application.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    const furthest =
      [keep, ...others]
        .map((l) => l.status)
        .filter((s) => s !== "LOST")
        .sort((a, b) => LEAD_STATUS_FLOW.indexOf(b) - LEAD_STATUS_FLOW.indexOf(a))[0] ?? keep.status;
    await tx.lead.update({
      where: { id: keepId },
      data: {
        status: furthest,
        childName: keep.childName ?? others.find((o) => o.childName)?.childName,
        utmSource: keep.utmSource ?? others.find((o) => o.utmSource)?.utmSource,
        activities: {
          create: {
            kind: "MERGE",
            actorId: actor.id,
            body: `Merged ${others.length} duplicate lead(s): ${others.map((o) => o.email).join(", ")}`,
          },
        },
      },
    });
    await tx.lead.updateMany({ where: { id: { in: ids } }, data: { mergedIntoId: keepId } });
    await audit(
      {
        actor,
        action: "lead.merge",
        entity: "Lead",
        entityId: keepId,
        before: others.map((o) => ({ id: o.id, email: o.email, status: o.status })),
        after: { keepId },
      },
      tx,
    );
  });
}
