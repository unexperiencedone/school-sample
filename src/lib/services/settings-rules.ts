import type { Role } from "@prisma/client";
import { z } from "zod";
import { email } from "@/lib/schemas/common";
import { PERMISSIONS, ROLE_PERMISSIONS, SENSITIVE, STAFF_ROLES, isStaff, type Permission } from "@/lib/rbac";

/**
 * Pure rules for the Settings module: the school profile shape, the guards on role changes, the role matrix and
 * the helpers that keep secrets out of anything shown or logged. No I/O, so every branch is unit tested.
 */

export type StaffRole = (typeof STAFF_ROLES)[number];

// ───────────────────────────── School profile ─────────────────────────────

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

const optionalUrl = z
  .string()
  .trim()
  .max(300, "That link is too long")
  .refine((v) => v === "" || isHttpUrl(v), "Enter a full link starting with https://");

const phoneText = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{5,22}$/, "Enter a phone number, e.g. +91 00000 00000");

export const REGISTRATION_FEE_MAX_PAISE = 10_000_000; // Rs 1,00,000

const addressLines = z
  .array(z.string().trim().max(120, "Keep each address line under 120 characters"))
  .transform((lines) => lines.filter(Boolean))
  .pipe(
    z.array(z.string()).min(1, "Enter at least one address line").max(6, "Use six address lines at most"),
  );

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the school's full name").max(120),
  shortName: z.string().trim().min(2, "Enter a short name").max(60),
  tagline: z.string().trim().max(200, "Keep the tagline under 200 characters"),
  addressLines,
  phone: phoneText,
  email,
  admissionsEmail: email,
  website: z
    .string()
    .trim()
    .max(300)
    .refine(isHttpUrl, "Enter the full website address, e.g. https://aurelia-sample.test"),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s+().-]/g, ""))
    .pipe(z.string().regex(/^\d{10,15}$/, "Digits only, with country code, e.g. 910000000000")),
  social: z.object({ instagram: optionalUrl, linkedin: optionalUrl, youtube: optionalUrl }),
  registrationFeePaise: z
    .number({ invalid_type_error: "Enter the registration fee in rupees" })
    .int("The fee must be a whole number of paise")
    .min(0, "The fee can't be negative")
    .max(REGISTRATION_FEE_MAX_PAISE, "That fee looks too high (the limit is Rs 1,00,000)"),
});

export type SchoolProfile = z.output<typeof schoolProfileSchema>;
export type SchoolProfileInput = z.input<typeof schoolProfileSchema>;

export const SCHOOL_PROFILE_KEY = "school_profile";

/**
 * Overlays a stored profile on the static defaults. Each field is validated on its own, so one bad or missing
 * value (an older save, a hand-edited row) falls back to the default instead of discarding the whole profile.
 */
export function mergeSchoolProfile(defaults: SchoolProfile, stored: unknown): SchoolProfile {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
  const raw = stored as Record<string, unknown>;
  const out: SchoolProfile = { ...defaults, social: { ...defaults.social } };
  const shape = schoolProfileSchema.shape;

  const take = <K extends Exclude<keyof SchoolProfile, "social">>(key: K) => {
    if (raw[key] === undefined) return;
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data as SchoolProfile[K];
  };
  take("name");
  take("shortName");
  take("tagline");
  take("addressLines");
  take("phone");
  take("email");
  take("admissionsEmail");
  take("website");
  take("whatsapp");
  take("registrationFeePaise");

  const social = shape.social.partial().safeParse(raw.social);
  if (social.success) {
    for (const k of ["instagram", "linkedin", "youtube"] as const) {
      const v = social.data[k];
      if (v !== undefined) out.social[k] = v;
    }
  }
  return out;
}

// ───────────────────────────── Users and roles ─────────────────────────────

export const staffRoleSchema = z.enum(STAFF_ROLES);

export const reasonSchema = z.string().trim().min(5, "Give a reason (a few words)").max(500);

export const inviteSchema = z.object({
  email,
  name: z.string().trim().min(2, "Enter their name").max(100),
  role: staffRoleSchema,
});

export const roleChangeSchema = z.object({ role: staffRoleSchema, reason: reasonSchema });

export const activeChangeSchema = z.object({ active: z.boolean(), reason: reasonSchema });

type RuleTarget = { id: string; role: Role; active: boolean };

/** Why a role change must be refused, or null when it may go ahead. */
export function roleChangeBlocker(i: {
  actorId: string;
  target: RuleTarget;
  newRole: Role;
  /** Active super admins other than the target. */
  otherActiveSuperAdmins: number;
}): string | null {
  if (i.target.id === i.actorId) return "You can't change your own role. Ask another super admin.";
  if (!isStaff(i.target.role)) return "Only staff accounts are managed here.";
  if (!isStaff(i.newRole)) return "Choose a staff role.";
  if (i.newRole === i.target.role) return "They already have that role.";
  if (i.target.role === "SUPER_ADMIN" && i.target.active && i.otherActiveSuperAdmins === 0)
    return "There must always be at least one active super admin.";
  return null;
}

/** Why an account can't be switched on or off, or null when it may. */
export function activeChangeBlocker(i: {
  actorId: string;
  target: RuleTarget;
  active: boolean;
  otherActiveSuperAdmins: number;
}): string | null {
  if (i.target.id === i.actorId) return "You can't change your own access. Ask another super admin.";
  if (!isStaff(i.target.role)) return "Only staff accounts are managed here.";
  if (i.target.active === i.active)
    return i.active ? "That account is already active." : "That account is already off.";
  if (!i.active && i.target.role === "SUPER_ADMIN" && i.otherActiveSuperAdmins === 0)
    return "There must always be at least one active super admin.";
  return null;
}

// ───────────────────────────── Role matrix ─────────────────────────────

const MODULE_OF: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  tours: "Tours and events",
  applications: "Admissions",
  academics: "Academics",
  students: "Students",
  fees: "Fees",
  invoices: "Fees",
  concessions: "Fees",
  payments: "Payments",
  refunds: "Payments",
  reconciliation: "Payments",
  imprest: "Imprest",
  careers: "Careers",
  comms: "Communication",
  content: "Content",
  reports: "Reports",
  settings: "Settings",
  users: "Settings",
  audit: "Settings",
  privacy: "Settings",
  demo: "Settings",
};

export function moduleOf(permission: Permission): string {
  return MODULE_OF[permission.split(":")[0]!] ?? "Other";
}

export type MatrixRow = { permission: Permission; sensitive: boolean; roles: Record<StaffRole, boolean> };
export type MatrixModule = { module: string; rows: MatrixRow[] };

/** Staff roles by permission, grouped by module in the order modules first appear in the permission list. */
export function roleMatrix(): { roles: readonly StaffRole[]; modules: MatrixModule[] } {
  const modules: MatrixModule[] = [];
  for (const permission of PERMISSIONS) {
    if (permission === "portal:access" || permission === "applicant:access") continue;
    const name = moduleOf(permission);
    let group = modules.find((m) => m.module === name);
    if (!group) {
      group = { module: name, rows: [] };
      modules.push(group);
    }
    group.rows.push({
      permission,
      sensitive: SENSITIVE.includes(permission),
      roles: Object.fromEntries(
        STAFF_ROLES.map((r) => [r, ROLE_PERMISSIONS[r].includes(permission)]),
      ) as Record<StaffRole, boolean>,
    });
  }
  return { roles: STAFF_ROLES, modules };
}

// ───────────────────────────── Keeping secrets out of messages ─────────────────────────────

const SECRET_ENV_NAME = /(KEY|SECRET|TOKEN|PASS|PASSWORD|SALT|AUTH|DSN|_URL$)/i;
const MIN_SECRET_LENGTH = 6;

/**
 * Removes anything that looks like a credential from text that will be shown or audit-logged: the value of every
 * secret-looking environment variable, user:password pairs inside URLs and bearer tokens. Also caps the length.
 */
export function scrubSecrets(
  text: string,
  env: Record<string, string | undefined> = process.env,
  maxLength = 240,
): string {
  const secrets = Object.entries(env)
    .filter(
      ([name, value]) =>
        !!value &&
        value.length >= MIN_SECRET_LENGTH &&
        SECRET_ENV_NAME.test(name) &&
        !name.startsWith("NEXT_PUBLIC_"),
    )
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const s of secrets) out = out.split(s).join("[redacted]");
  out = out
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//[redacted]@")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]");
  return out.length > maxLength ? `${out.slice(0, maxLength - 1)}…` : out;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** One line for a CronRun result: the error text for failures, otherwise `key value` pairs. */
export function summariseResult(result: unknown, maxLength = 140): string {
  if (result === null || result === undefined) return "—";
  let text: string;
  if (typeof result === "object" && !Array.isArray(result)) {
    const entries = Object.entries(result as Record<string, unknown>);
    const err = (result as { error?: unknown }).error;
    text =
      typeof err === "string"
        ? `Error: ${err}`
        : entries
            .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
            .join(", ");
  } else {
    text = JSON.stringify(result);
  }
  text = scrubSecrets(text, process.env, maxLength);
  return text || "—";
}
