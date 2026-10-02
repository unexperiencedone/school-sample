"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { setCurrentYear, updateSection, updateTerm } from "@/lib/services/academics";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
async function run(fn: () => Promise<string | void>, paths: string[]): Promise<ActionResult> {
  try {
    const message = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .transform((v) => new Date(`${v}T00:00:00Z`));

export async function updateSectionAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("academics:write");
  return run(async () => {
    await updateSection(user, id, {
      capacity: z.coerce.number().int().min(1).max(40).parse(form.get("capacity")),
      classTeacherId: String(form.get("classTeacherId") ?? "") || null,
      room: String(form.get("room") ?? "").trim() || null,
    });
    return "Section updated";
  }, ["/admin/academics", "/admin"]);
}

export async function updateTermAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("academics:write");
  return run(async () => {
    await updateTerm(user, id, {
      name: z.string().trim().min(2).max(40).parse(form.get("name")),
      startDate: date.parse(form.get("startDate")),
      endDate: date.parse(form.get("endDate")),
    });
    return "Term dates saved";
  }, ["/admin/academics/years"]);
}

export async function setCurrentYearAction(id: string): Promise<ActionResult> {
  const user = await actionUser("settings:write");
  return run(async () => {
    await setCurrentYear(user, id, "Switched from Academics › Years");
    return "Current year switched";
  }, ["/admin", "/admin/academics/years"]);
}
