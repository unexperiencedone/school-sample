import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { toCsv } from "@/lib/crm/csv";
import { cursorList, dateRange, type ListParams } from "@/lib/crm/list";
import { formatDate } from "@/lib/dates";
import { describeChanges, diffAudit, type Change } from "./audit-viewer-rules";

/**
 * Audit log viewer. Rows are shown as a list of changed fields (never the raw JSON), with sensitive keys redacted
 * and long values truncated, so what the page and the export reveal is bounded by the same rules.
 */

type Actor = { id: string; role: Role };

export type AuditFilters = { q?: string; entity?: string; actor?: string; from?: string; to?: string };

export const AUDIT_EXPORT_LIMIT = 5000;

const withActor = { actor: { select: { name: true, email: true } } } satisfies Prisma.AuditLogInclude;
type Row = Prisma.AuditLogGetPayload<{ include: typeof withActor }>;

export type AuditRowView = {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  ip: string | null;
  reason: string | null;
  changes: Change[];
  more: number;
};

export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const createdAt = dateRange(f.from, f.to);
  const q = f.q?.trim();
  return {
    ...(q ? { action: { contains: q, mode: "insensitive" } } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.actor ? { actorId: f.actor === "none" ? null : f.actor } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

function toView(r: Row): AuditRowView {
  const { changes, more } = diffAudit(r.before, r.after);
  return {
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actorName: r.actor?.name ?? null,
    actorEmail: r.actor?.email ?? null,
    actorRole: r.actorRole,
    ip: r.ip,
    reason: r.reason,
    changes,
    more,
  };
}

export async function listAuditLogs(actor: Actor, filters: AuditFilters, params: ListParams) {
  assertCan(actor.role, "audit:read");
  const { rows, next, prev, total } = await cursorList<Row>(
    db.auditLog,
    { where: auditWhere(filters), include: withActor },
    params,
  );
  return { rows: rows.map(toView), next, prev, total };
}

/** The values the filter bar offers: entities and actors that appear in the log. */
export async function auditFacets(actor: Actor) {
  assertCan(actor.role, "audit:read");
  const [entities, actorIds] = await Promise.all([
    db.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } }),
    db.auditLog.groupBy({ by: ["actorId"] }),
  ]);
  const ids = actorIds.map((a) => a.actorId).filter((id): id is string => !!id);
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return {
    entities: entities.map((e) => e.entity),
    actors: users.map((u) => ({ id: u.id, label: u.name ?? u.email })),
    hasSystem: actorIds.some((a) => a.actorId === null),
  };
}

/** CSV of the filtered log (newest first, capped). The export itself is audit-logged with the filter used. */
export async function exportAuditCsv(actor: Actor, filters: AuditFilters) {
  assertCan(actor.role, "audit:read");
  const rows = await db.auditLog.findMany({
    where: auditWhere(filters),
    include: withActor,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_EXPORT_LIMIT,
  });
  await audit({
    actor,
    action: "audit.export",
    entity: "AuditLog",
    after: { filter: filters, rows: rows.length },
    reason: "Audit log exported to CSV",
  });
  const csv = toCsv(
    ["When (IST)", "Actor", "Role", "Action", "Entity", "Entity id", "Reason", "IP", "Changes"],
    rows.map((r) => {
      const v = toView(r);
      return [
        formatDate(v.createdAt, "yyyy-MM-dd HH:mm:ss"),
        v.actorName ?? v.actorEmail ?? "System",
        v.actorRole,
        v.action,
        v.entity,
        v.entityId,
        v.reason,
        v.ip,
        describeChanges(v.changes, v.more),
      ];
    }),
  );
  return { csv, filename: `audit-log-${formatDate(new Date(), "yyyy-MM-dd")}.csv`, rows: rows.length };
}
