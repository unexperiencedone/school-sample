import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { requestMeta } from "@/lib/request";

export type AuditInput = {
  actor: { id: string; role: Role } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/** Writes an immutable audit entry (who, what, before/after, IP, time). Pass `tx` to commit atomically with the change. */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  const meta = await requestMeta();
  await (tx ?? db).auditLog.create({
    data: {
      actorId: input.actor?.id,
      actorRole: input.actor?.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      before: toJson(input.before),
      after: toJson(input.after),
      reason: input.reason ?? undefined,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}
