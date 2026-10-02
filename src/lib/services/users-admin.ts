import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { assertCan, STAFF_ROLES } from "@/lib/rbac";
import {
  activeChangeBlocker,
  activeChangeSchema,
  inviteSchema,
  roleChangeBlocker,
  roleChangeSchema,
} from "./settings-rules";

/**
 * Staff accounts: who they are, what role they hold and whether they can sign in. Parent and applicant accounts
 * are not managed here. A role change or switch-off takes effect on the person's next request, because the
 * session is re-checked against the database every time.
 */

type Actor = { id: string; role: Role };

const STAFF_USER = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function listStaffUsers(actor: Actor) {
  assertCan(actor.role, "users:manage");
  return db.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: STAFF_USER,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

// Serializable, so two super admins demoting each other at the same moment can't both pass the "last one" check.
const SERIALIZABLE = { isolationLevel: "Serializable" } as const;

export async function changeStaffRole(actor: Actor, userId: string, input: unknown) {
  assertCan(actor.role, "users:manage");
  const { role, reason } = roleChangeSchema.parse(input);
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: STAFF_USER });
    if (!target) throw new ApiError(404, "NOT_FOUND", "No such user.");
    const blocker = roleChangeBlocker({
      actorId: actor.id,
      target,
      newRole: role,
      otherActiveSuperAdmins: await tx.user.count({
        where: { role: "SUPER_ADMIN", active: true, id: { not: userId } },
      }),
    });
    if (blocker) throw new ApiError(409, "ROLE_CHANGE_BLOCKED", blocker);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await audit(
      {
        actor,
        action: "user.role_change",
        entity: "User",
        entityId: userId,
        before: { role: target.role },
        after: { role },
        reason,
      },
      tx,
    );
    return { ...target, role };
  }, SERIALIZABLE);
}

export async function setStaffActive(actor: Actor, userId: string, input: unknown) {
  assertCan(actor.role, "users:manage");
  const { active, reason } = activeChangeSchema.parse(input);
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: STAFF_USER });
    if (!target) throw new ApiError(404, "NOT_FOUND", "No such user.");
    const blocker = activeChangeBlocker({
      actorId: actor.id,
      target,
      active,
      otherActiveSuperAdmins: await tx.user.count({
        where: { role: "SUPER_ADMIN", active: true, id: { not: userId } },
      }),
    });
    if (blocker) throw new ApiError(409, "ACCESS_CHANGE_BLOCKED", blocker);
    await tx.user.update({ where: { id: userId }, data: { active } });
    await audit(
      {
        actor,
        action: active ? "user.reactivate" : "user.deactivate",
        entity: "User",
        entityId: userId,
        before: { active: target.active },
        after: { active },
        reason,
      },
      tx,
    );
    return { ...target, active };
  }, SERIALIZABLE);
}

/**
 * Creates the account (no password: the person signs in with an emailed link) and sends the first link. If the
 * email can't be sent the account still exists, and the result says so.
 */
export async function inviteStaffUser(actor: Actor, input: unknown) {
  assertCan(actor.role, "users:manage");
  const data = inviteSchema.parse(input);
  if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } }))
    throw new ApiError(409, "EMAIL_TAKEN", "An account with that email address already exists.", {
      fieldErrors: { email: ["An account with that email address already exists"] },
    });
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: data.email, name: data.name, role: data.role, active: true },
      select: STAFF_USER,
    });
    await audit(
      {
        actor,
        action: "user.invite",
        entity: "User",
        entityId: created.id,
        after: { email: created.email, name: created.name, role: created.role },
        reason: "Staff account invited",
      },
      tx,
    );
    return created;
  });
  let emailed = true;
  try {
    await signIn("magic-link", { email: user.email, redirect: false, redirectTo: "/login/continue" });
  } catch {
    emailed = false;
  }
  return { user, emailed };
}
