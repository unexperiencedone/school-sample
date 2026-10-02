"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import {
  respondToRequest,
  runPromotion,
  updateMedical,
  updateStudent,
  withdrawStudent,
} from "@/lib/services/students";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

async function run(
  fn: () => Promise<{ message?: string; id?: string } | void>,
  paths: string[],
): Promise<ActionResult> {
  try {
    const r = (await fn()) ?? {};
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const reason = z.string().trim().min(5, "Give a reason (a few words)").max(500);
const opt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function updateStudentAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("students:write");
  return run(async () => {
    await updateStudent(
      user,
      id,
      {
        firstName: z.string().trim().min(1).max(60).parse(form.get("firstName")),
        lastName: z.string().trim().min(1).max(60).parse(form.get("lastName")),
        houseId: opt(form.get("houseId")),
        sectionId: opt(form.get("sectionId")),
        boardingType: z.enum(["FULL", "FLEXI", "DAY"]).parse(form.get("boardingType")),
      },
      reason.parse(form.get("reason")),
    );
    return { message: "Details updated" };
  }, [`/admin/students/${id}`, "/admin/students"]);
}

export async function withdrawStudentAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("students:write");
  return run(async () => {
    await withdrawStudent(user, id, {
      kind: z.enum(["WITHDRAWN", "TRANSFERRED"]).parse(form.get("kind")),
      leftOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day")
        .transform((v) => new Date(`${v}T00:00:00Z`))
        .parse(form.get("leftOn")),
      destination: opt(form.get("destination")),
      reason: reason.parse(form.get("reason")),
    });
    return { message: "Recorded. Finance can now quote any refund under the policy." };
  }, [`/admin/students/${id}`, "/admin/students", "/admin"]);
}

export async function updateMedicalAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("students:medical");
  return run(async () => {
    const f = (k: string) => opt(form.get(k))?.slice(0, 500) ?? null;
    await updateMedical(user, id, {
      bloodGroup: f("bloodGroup"),
      allergies: f("allergies"),
      conditions: f("conditions"),
      medications: f("medications"),
      doctorName: f("doctorName"),
      doctorPhone: f("doctorPhone"),
      notes: f("notes"),
    });
    return { message: "Medical record updated" };
  }, [`/admin/students/${id}/medical`]);
}

export async function promoteAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("students:promote");
  return run(async () => {
    const excluded = form.getAll("exclude").map(String);
    const r = await runPromotion(user, excluded, reason.parse(form.get("reason")));
    return {
      message: `${r.moved} pupils moved into next year${r.retained ? `, ${r.retained} repeating` : ""}`,
    };
  }, ["/admin/students", "/admin/students/promotion", "/admin/academics"]);
}

export async function respondRequestAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser();
  return run(async () => {
    await respondToRequest(user, id, {
      status: z.enum(["IN_REVIEW", "APPROVED", "REJECTED", "CLOSED"]).parse(form.get("status")),
      response: z
        .string()
        .trim()
        .max(1000)
        .parse(form.get("response") ?? ""),
    });
    return { message: "Response saved — the family sees it in the portal" };
  }, ["/admin/students/requests", "/portal"]);
}
