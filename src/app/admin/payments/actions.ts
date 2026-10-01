"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { formatINR, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  allocationPreview,
  decideRefund,
  MANUAL_METHODS,
  processRefund,
  recordManualPayment,
  refundQuoteFor,
  requestRefund,
} from "@/lib/services/payments-admin";
import { importStatement, matchLine, setLineStatus } from "@/lib/services/reconciliation";

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

const amount = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .transform((v, ctx) => {
    try {
      return toPaise(v.replace(/,/g, ""));
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees" });
      return z.NEVER;
    }
  });

export async function previewAllocationAction(
  studentId: string,
  rupees: string,
  instalmentId: string | null,
) {
  await actionUser("payments:record");
  try {
    const paise = amount.parse(rupees);
    if (paise <= 0) return null;
    return await allocationPreview(studentId, paise, instalmentId);
  } catch {
    return null;
  }
}

export async function recordPaymentAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("payments:record");
  return run(async () => {
    const r = await recordManualPayment(user, {
      studentId: z.string().min(1, "Choose a pupil").parse(form.get("studentId")),
      amountPaise: amount.parse(String(form.get("amount") ?? "")),
      method: z.enum(MANUAL_METHODS).parse(form.get("method")),
      reference: String(form.get("reference") ?? ""),
      receivedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date received")
        // Today means now; an earlier date is recorded at midday IST that day
        .transform((v) =>
          v === formatDate(new Date(), "yyyy-MM-dd") ? new Date() : new Date(`${v}T12:00:00+05:30`),
        )
        .parse(form.get("receivedAt")),
      instalmentId: String(form.get("instalmentId") ?? "") || null,
      notes: String(form.get("notes") ?? ""),
      clientKey: z.string().uuid().parse(form.get("clientKey")),
    });
    return {
      message: r.duplicate
        ? `Already recorded as ${r.receipt?.number} — nothing was added`
        : `Receipt ${r.receipt?.number} issued for ${formatINR(r.payment.amountPaise)}${r.walletCredit ? ` (${formatINR(r.walletCredit)} held as credit)` : ""}`,
      id: r.receipt?.id,
    };
  }, ["/admin/payments", "/admin/fees/dues", "/admin/fees/invoices", "/admin"]);
}

export async function refundQuoteAction(studentId: string, withdrawalDate: string, noticeDays: number) {
  await actionUser("refunds:request");
  return refundQuoteFor(studentId, {
    withdrawalDate: new Date(`${withdrawalDate}T00:00:00Z`),
    noticeGivenDays: Math.max(0, Math.round(noticeDays)),
  });
}

export async function requestRefundAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("refunds:request");
  return run(async () => {
    const policy = String(form.get("policy") ?? "");
    const r = await requestRefund(user, {
      paymentId: z.string().min(1).parse(form.get("paymentId")),
      amountPaise: amount.parse(String(form.get("amount") ?? "")),
      reason: z.string().trim().min(5, "Explain why this refund is due").parse(form.get("reason")),
      policy: policy ? (JSON.parse(policy) as unknown) : undefined,
      clientKey: z.string().uuid().parse(form.get("clientKey")),
    });
    return { message: "Refund requested — it now needs the Principal's approval", id: r.id };
  }, ["/admin/payments/refunds", "/admin"]);
}

export async function decideRefundAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note: string,
): Promise<ActionResult> {
  const user = await actionUser("refunds:approve");
  return run(async () => {
    await decideRefund(user, id, decision, z.string().trim().min(3, "Add a short note").parse(note));
    return {
      message: decision === "APPROVED" ? "Approved — Accounts can now pay it out" : "Refund rejected",
    };
  }, ["/admin/payments/refunds", "/admin"]);
}

export async function processRefundAction(id: string, reference: string): Promise<ActionResult> {
  const user = await actionUser("payments:record");
  return run(async () => {
    const r = await processRefund(user, id, { reference });
    return {
      message:
        r.status === "PROCESSED"
          ? "Refund paid out and the family notified"
          : "Sent to the gateway — awaiting confirmation",
    };
  }, ["/admin/payments/refunds", "/admin/payments", "/admin"]);
}

export async function importStatementAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("reconciliation:run");
  return run(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("Choose a CSV file exported from the bank");
    if (file.size > 2_000_000) throw new Error("Statement files are limited to 2 MB");
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv")
      throw new Error("Upload the statement as a .csv file");
    const r = await importStatement(user, file.name, await file.text());
    return {
      message: `${r.lines} credits imported, ${r.matched} matched automatically (${r.byReference} by reference)${r.errors.length ? ` · ${r.errors.length} rows skipped` : ""}`,
      id: r.importId,
    };
  }, ["/admin/payments/reconciliation"]);
}

export async function matchLineAction(lineId: string, paymentId: string): Promise<ActionResult> {
  const user = await actionUser("reconciliation:run");
  return run(
    () => matchLine(user, lineId, paymentId).then(() => ({ message: "Matched" })),
    ["/admin/payments/reconciliation"],
  );
}

export async function setLineStatusAction(
  lineId: string,
  status: "UNMATCHED" | "IGNORED",
): Promise<ActionResult> {
  const user = await actionUser("reconciliation:run");
  return run(
    () =>
      setLineStatus(user, lineId, status).then(() => ({
        message: status === "IGNORED" ? "Marked as not a fee payment" : "Unmatched",
      })),
    ["/admin/payments/reconciliation"],
  );
}
