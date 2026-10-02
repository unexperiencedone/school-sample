import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { school, siteUrl } from "@/config/school";
import {
  SCHOOL_PROFILE_KEY,
  mergeSchoolProfile,
  schoolProfileSchema,
  type SchoolProfile,
  type SchoolProfileInput,
} from "./settings-rules";

/**
 * School settings. The profile lives in the `Setting` table under `school_profile` and is overlaid on the static
 * defaults in `src/config/school.ts`. The public site still reads the static config; `getSchoolProfile()` is the
 * hook for rewiring it later.
 */

type Actor = { id: string; role: Role };

function staticProfile(): SchoolProfile {
  return {
    name: school.name,
    shortName: school.shortName,
    tagline: school.tagline,
    addressLines: [...school.contact.address],
    phone: school.contact.phone,
    email: school.contact.email,
    admissionsEmail: school.contact.admissionsEmail,
    website: siteUrl(),
    whatsapp: school.contact.whatsapp,
    social: { ...school.social },
    registrationFeePaise: school.registrationFeePaise,
  };
}

/** The school's profile: the saved setting over the static defaults. No permission needed (it is public information). */
export async function getSchoolProfile(): Promise<SchoolProfile> {
  const row = await db.setting.findUnique({ where: { key: SCHOOL_PROFILE_KEY } });
  return mergeSchoolProfile(staticProfile(), row?.value);
}

/** Profile plus the read-only context shown beside it. */
export async function schoolSettingsView(actor: Actor) {
  assertCan(actor.role, "settings:read");
  const [profile, row, year] = await Promise.all([
    getSchoolProfile(),
    db.setting.findUnique({ where: { key: SCHOOL_PROFILE_KEY }, select: { updatedAt: true } }),
    db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } }),
  ]);
  return { profile, updatedAt: row?.updatedAt ?? null, currentYear: year };
}

export async function updateSchoolProfile(actor: Actor, input: SchoolProfileInput): Promise<SchoolProfile> {
  assertCan(actor.role, "settings:write");
  const next = schoolProfileSchema.parse(input);
  const before = await getSchoolProfile();
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: SCHOOL_PROFILE_KEY },
      create: { key: SCHOOL_PROFILE_KEY, value: next },
      update: { value: next },
    });
    await audit(
      {
        actor,
        action: "settings.school_profile",
        entity: "Setting",
        entityId: SCHOOL_PROFILE_KEY,
        before,
        after: next,
      },
      tx,
    );
  });
  return next;
}
