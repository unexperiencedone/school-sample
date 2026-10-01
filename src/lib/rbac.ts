import type { Role } from "@prisma/client";

/**
 * Role-based access control. The matrix below is the single source of truth and is mirrored
 * in docs/ARCHITECTURE.md. Enforce on the server with `assertCan` (route handlers, server actions)
 * — hiding UI is a convenience, not a control.
 */
export const PERMISSIONS = [
  "dashboard:view",
  "leads:read",
  "leads:write",
  "leads:assign",
  "leads:merge",
  "leads:export",
  "tours:read",
  "tours:write",
  "applications:read",
  "applications:write",
  "applications:decide",
  "academics:read",
  "academics:write",
  "students:read",
  "students:write",
  "students:promote",
  "students:medical",
  "students:export",
  "students:delete",
  "fees:read",
  "fees:revise",
  "fees:waive",
  "invoices:write",
  "concessions:request",
  "concessions:approve",
  "payments:read",
  "payments:record",
  "refunds:request",
  "refunds:approve",
  "reconciliation:run",
  "imprest:read",
  "imprest:write",
  "careers:read",
  "careers:write",
  "comms:read",
  "comms:send",
  "content:write",
  "reports:read",
  "reports:export",
  "settings:read",
  "settings:write",
  "users:manage",
  "audit:read",
  "privacy:manage",
  "demo:reset",
  "portal:access",
  "applicant:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "ACCOUNTS",
  "REGISTRAR",
  "TEACHER",
  "HOUSEPARENT",
  "HR",
] as const satisfies readonly Role[];

const ALL_STAFF_EXCEPT_SUPER = PERMISSIONS.filter(
  (p) => !["portal:access", "applicant:access", "users:manage", "settings:write", "demo:reset"].includes(p),
);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS.filter((p) => p !== "portal:access" && p !== "applicant:access"),
  PRINCIPAL: ALL_STAFF_EXCEPT_SUPER.filter((p) => p !== "students:delete" && p !== "privacy:manage"),
  ADMISSIONS: [
    "dashboard:view",
    "leads:read",
    "leads:write",
    "leads:assign",
    "leads:merge",
    "leads:export",
    "tours:read",
    "tours:write",
    "applications:read",
    "applications:write",
    "applications:decide",
    "academics:read",
    "students:read",
    "fees:read",
    "comms:read",
    "comms:send",
    "content:write",
    "reports:read",
  ],
  ACCOUNTS: [
    "dashboard:view",
    "applications:read",
    "academics:read",
    "students:read",
    "fees:read",
    "fees:revise",
    "fees:waive",
    "invoices:write",
    "concessions:request",
    "payments:read",
    "payments:record",
    "refunds:request",
    "reconciliation:run",
    "imprest:read",
    "imprest:write",
    "comms:read",
    "comms:send",
    "reports:read",
    "reports:export",
  ],
  REGISTRAR: [
    "dashboard:view",
    "applications:read",
    "academics:read",
    "academics:write",
    "students:read",
    "students:write",
    "students:promote",
    "students:medical",
    "students:export",
    "fees:read",
    "comms:read",
    "comms:send",
    "reports:read",
  ],
  TEACHER: ["dashboard:view", "academics:read", "students:read", "comms:read"],
  HOUSEPARENT: [
    "dashboard:view",
    "academics:read",
    "students:read",
    "students:medical",
    "imprest:read",
    "imprest:write",
    "comms:read",
  ],
  HR: ["dashboard:view", "careers:read", "careers:write", "comms:read", "comms:send", "reports:read"],
  PARENT: ["portal:access"],
  APPLICANT: ["applicant:access"],
};

/** Actions that must always write an audit entry with a reason. */
export const SENSITIVE: readonly Permission[] = [
  "fees:revise",
  "fees:waive",
  "concessions:approve",
  "refunds:approve",
  "students:delete",
  "students:export",
  "leads:export",
  "reports:export",
  "privacy:manage",
  "users:manage",
];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  PRINCIPAL: "Principal",
  ADMISSIONS: "Admissions",
  ACCOUNTS: "Accounts",
  REGISTRAR: "Registrar",
  TEACHER: "Teacher",
  HOUSEPARENT: "Houseparent",
  HR: "HR",
  PARENT: "Parent",
  APPLICANT: "Applicant",
};

export { STAFF_ROLES };
