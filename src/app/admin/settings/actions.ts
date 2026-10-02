"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import { toPaise } from "@/lib/money";
import { updateSchoolProfile } from "@/lib/services/settings";
import { runJobNow, testIntegration } from "@/lib/services/settings-integrations";
import { changeStaffRole, inviteStaffUser, setStaffActive } from "@/lib/services/users-admin";
import { resolveDataRequest } from "@/lib/services/privacy";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/** Result of a test or a job run: `ok` says the action ran, `outcome.ok` says whether the thing itself passed. */
export type OutcomeResult =
  | { ok: true; outcome: { ok: boolean; message: string; ms: number; href?: string } }
  | { ok: false; error: string };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
  if (e instanceof ApiError) return { ok: false, error: e.message };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

async function run(
  fn: () => Promise<{ message?: string; id?: string } | void>,
  paths: string[],
): Promise<ActionResult> {
  try {
    const r = (await fn()) ?? {};
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, ...r };
  } catch (e) {
    return failure(e);
  }
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

function rupeesToPaise(value: string): number {
  try {
    return toPaise(value);
  } catch {
    throw new ApiError(422, "VALIDATION_FAILED", "Enter the registration fee in rupees, e.g. 10000");
  }
}

export async function saveSchoolProfileAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("settings:write");
  return run(async () => {
    await updateSchoolProfile(user, {
      name: text(form, "name"),
      shortName: text(form, "shortName"),
      tagline: text(form, "tagline"),
      addressLines: text(form, "addressLines").split(/\r?\n/),
      phone: text(form, "phone"),
      email: text(form, "email"),
      admissionsEmail: text(form, "admissionsEmail"),
      website: text(form, "website"),
      whatsapp: text(form, "whatsapp"),
      social: {
        instagram: text(form, "instagram"),
        linkedin: text(form, "linkedin"),
        youtube: text(form, "youtube"),
      },
      registrationFeePaise: rupeesToPaise(text(form, "registrationFee")),
    });
    return { message: "School profile saved" };
  }, ["/admin/settings"]);
}

export async function testIntegrationAction(key: string, form: FormData): Promise<OutcomeResult> {
  try {
    const user = await actionUser("settings:write");
    const outcome = await testIntegration(user, key, { phone: text(form, "phone") });
    revalidatePath("/admin/outbox");
    return { ok: true, outcome };
  } catch (e) {
    return failure(e);
  }
}

export async function runJobAction(job: string): Promise<OutcomeResult> {
  try {
    const user = await actionUser("settings:write");
    const outcome = await runJobNow(user, job);
    revalidatePath("/admin/settings/integrations");
    return { ok: true, outcome: { ok: outcome.ok, message: outcome.message, ms: outcome.ms } };
  } catch (e) {
    return failure(e);
  }
}

export async function changeRoleAction(userId: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("users:manage");
  return run(async () => {
    const updated = await changeStaffRole(user, userId, {
      role: text(form, "role"),
      reason: text(form, "reason"),
    });
    return { message: `Role changed for ${updated.name ?? updated.email}` };
  }, ["/admin/settings/users", "/admin/settings/audit"]);
}

export async function setActiveAction(
  userId: string,
  active: boolean,
  form: FormData,
): Promise<ActionResult> {
  const user = await actionUser("users:manage");
  return run(async () => {
    const updated = await setStaffActive(user, userId, { active, reason: text(form, "reason") });
    return {
      message: `${updated.name ?? updated.email} ${active ? "can sign in again" : "can no longer sign in"}`,
    };
  }, ["/admin/settings/users", "/admin/settings/audit"]);
}

export async function inviteUserAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("users:manage");
  return run(async () => {
    const { user: created, emailed } = await inviteStaffUser(user, {
      email: text(form, "email"),
      name: text(form, "name"),
      role: text(form, "role"),
    });
    if (!emailed)
      throw new ApiError(
        502,
        "EMAIL_FAILED",
        `${created.email} was added, but the sign-in email could not be sent. They can request a link from the sign-in page.`,
      );
    return { message: `Invited ${created.email}. Their sign-in link is in the Outbox.`, id: created.id };
  }, ["/admin/settings/users", "/admin/settings/audit", "/admin/outbox"]);
}

export async function resolveRequestAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("privacy:manage");
  return run(async () => {
    const r = await resolveDataRequest(user, id, {
      status: text(form, "status"),
      notes: text(form, "notes"),
    });
    return { message: r.status === "DONE" ? "Request marked done" : "Request rejected" };
  }, ["/admin/settings/privacy", `/admin/settings/privacy/${id}`, "/admin/settings/audit"]);
}
