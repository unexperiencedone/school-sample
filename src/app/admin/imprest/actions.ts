"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { toPaise } from "@/lib/money";
import { addEntry, IMPREST_CATEGORIES, type ImprestCategory } from "@/lib/services/imprest";

export async function addEntryAction(
  studentId: string,
  form: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const user = await actionUser("imprest:write");
    const kind = z.enum(["CREDIT", "EXPENSE"]).parse(form.get("kind"));
    const category = z
      .enum(Object.keys(IMPREST_CATEGORIES) as [ImprestCategory, ...ImprestCategory[]])
      .parse(form.get("category"));
    const raw = String(form.get("amount") ?? "")
      .replace(/,/g, "")
      .trim();
    if (!raw) throw new Error("Enter an amount");
    await addEntry(user, {
      studentId,
      kind,
      category,
      amountPaise: toPaise(raw),
      description: z
        .string()
        .trim()
        .min(2, "Add a short description")
        .max(200)
        .parse(form.get("description")),
    });
    revalidatePath(`/admin/imprest/${studentId}`);
    revalidatePath("/admin/imprest");
    return { ok: true, message: kind === "CREDIT" ? "Credit added" : "Expense recorded" };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
