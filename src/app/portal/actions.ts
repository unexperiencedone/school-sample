"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createPortalRequest, requestDataExport, updateConsent } from "@/lib/services/portal";

type Result = { ok: true; message?: string } | { ok: false; error: string };
async function run(fn: () => Promise<string>, paths: string[]): Promise<Result> {
  try {
    const message = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, message };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);
const opt = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined;

export async function sendRequestAction(form: FormData): Promise<Result> {
  const user = await requireRole(["PARENT"]);
  return run(async () => {
    const studentId = z.string().min(1).parse(form.get("studentId"));
    const kind = z.enum(["WITHDRAWAL", "CONCESSION", "PROFILE_UPDATE"]).parse(form.get("kind"));
    const payload =
      kind === "WITHDRAWAL"
        ? {
            lastDay: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day at school")
              .parse(form.get("lastDay")),
            reason: text(5, 1000, "Tell us briefly why").parse(form.get("reason")),
            destination: opt(form.get("destination")),
          }
        : kind === "CONCESSION"
          ? {
              kind: opt(form.get("concessionKind")) ?? "Bursary",
              reason: text(10, 2000, "Tell us a little about your circumstances").parse(form.get("reason")),
            }
          : {
              phone: opt(form.get("phone")),
              email: opt(form.get("email")),
              address: opt(form.get("address")),
              note: opt(form.get("note")),
            };
    if (kind === "PROFILE_UPDATE" && !Object.values(payload).some(Boolean))
      throw new Error("Tell us what to change");
    await createPortalRequest(user, { studentId, kind, payload });
    return kind === "WITHDRAWAL"
      ? "Notice received. The Registrar will confirm and Accounts will send any refund quote under the fee policy."
      : "Request sent — you'll see the school's reply here.";
  }, ["/portal/requests", "/portal"]);
}

export async function updateConsentAction(form: FormData): Promise<Result> {
  const user = await requireRole(["PARENT"]);
  return run(async () => {
    await updateConsent(user, {
      email: form.get("email") === "on",
      whatsapp: form.get("whatsapp") === "on",
      sms: form.get("sms") === "on",
    });
    return "Your communication preferences are saved";
  }, ["/portal/profile"]);
}

export async function privacyRequestAction(kind: "EXPORT" | "DELETION"): Promise<Result> {
  const user = await requireRole(["PARENT"]);
  return run(async () => {
    await requestDataExport(
      user,
      kind,
      kind === "EXPORT" ? "Requested from the parent portal" : "Deletion requested from the parent portal",
    );
    return kind === "EXPORT"
      ? "Request logged. The school will email you a copy of your data within 30 days."
      : "Request logged. The school will contact you: records it must keep by law (e.g. fee receipts) are retained; everything else is erased.";
  }, ["/portal/profile"]);
}
