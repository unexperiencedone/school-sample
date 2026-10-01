"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { toPaise } from "@/lib/money";
import {
  decideConcession,
  discardDraft,
  publishRevision,
  requestConcession,
  saveDraftRevision,
  updateFeeHead,
  updateLateFeeRule,
  updateRebate,
  updateRefundPolicy,
  waiveLateFee,
} from "@/lib/services/fee-admin";
import { formatINR } from "@/lib/money";

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

const rupees = z
  .string()
  .trim()
  .transform((v, ctx) => {
    try {
      return toPaise(v.replace(/,/g, "") || "0");
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees" });
      return z.NEVER;
    }
  });
const reason = z.string().trim().min(5, "Give a reason (at least a few words)").max(500);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => new Date(`${v}T00:00:00Z`));

export async function saveDraftAction(activeId: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(async () => {
    const lines = [...form.entries()]
      .filter(([k]) => k.startsWith("head:"))
      .map(([k, v]) => ({ feeHeadId: k.slice(5), amountPaise: rupees.parse(String(v)) }));
    const draft = await saveDraftRevision(user, activeId, {
      lines,
      reason: reason.parse(form.get("reason")),
      effectiveFrom: date.parse(form.get("effectiveFrom")),
    });
    return { message: `Draft v${draft.version} saved — review the impact before publishing`, id: draft.id };
  }, ["/admin/fees"]);
}

export async function publishAction(draftId: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(async () => {
    const r = await publishRevision(user, draftId, {
      reprice: form.get("reprice") === "on",
      reason: reason.parse(form.get("reason")),
    });
    return {
      message: r.repriced
        ? `v${r.version} is live. ${r.repriced} invoices repriced (${formatINR(r.deltaPaise, { sign: true })}), families notified.`
        : `v${r.version} is live for new invoices and the website.`,
    };
  }, ["/admin/fees", "/admissions/fees/[boarding]", "/admin"]);
}

export async function discardAction(draftId: string): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(() => discardDraft(user, draftId, "Draft discarded"), ["/admin/fees"]);
}

export async function updateHeadAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(
    () =>
      updateFeeHead(user, id, {
        name: z.string().trim().min(2).max(80).parse(form.get("name")),
        refundable: form.get("refundable") === "on",
        active: form.get("active") === "on",
        reason: reason.parse(form.get("reason")),
      }),
    ["/admin/fees/heads"],
  );
}

export async function updateLateFeeAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(async () => {
    const pct = z.coerce.number().min(0).max(10).parse(form.get("ratePercent"));
    const cancel = String(form.get("cancelFlagAfterDays") ?? "").trim();
    await updateLateFeeRule(user, {
      ratePerMonthBp: Math.round(pct * 100),
      graceDays: z.coerce.number().int().min(0).max(90).parse(form.get("graceDays")),
      cancelFlagAfterDays: cancel ? z.coerce.number().int().min(15).max(365).parse(cancel) : null,
      reason: reason.parse(form.get("reason")),
    });
    return { message: "Late fee rule updated. Tonight's run will use it." };
  }, ["/admin/fees/rules"]);
}

export async function updateRebateAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  return run(
    () =>
      updateRebate(user, id, {
        amountPaise: rupees.parse(String(form.get("amount") ?? "")),
        payByDate: date.parse(form.get("payByDate")),
        active: form.get("active") === "on",
        reason: reason.parse(form.get("reason")),
      }),
    ["/admin/fees/rules"],
  );
}

export async function requestConcessionAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("concessions:request");
  return run(async () => {
    const pct = String(form.get("overridePercent") ?? "").trim();
    await requestConcession(user, {
      studentId: z.string().min(1, "Choose a pupil").parse(form.get("studentId")),
      concessionId: z.string().min(1).parse(form.get("concessionId")),
      yearId: z.string().min(1).parse(form.get("yearId")),
      reason: reason.parse(form.get("reason")),
      overrideBp: pct ? Math.round(z.coerce.number().min(0).max(100).parse(pct) * 100) : null,
    });
    return { message: "Request sent for approval" };
  }, ["/admin/fees/concessions", "/admin"]);
}

export async function decideConcessionAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note: string,
): Promise<ActionResult> {
  const user = await actionUser("concessions:approve");
  return run(async () => {
    const r = await decideConcession(user, id, decision, reason.parse(note));
    return {
      message:
        decision === "REJECTED"
          ? "Request rejected"
          : r.repriced
            ? `Approved — open invoice repriced (${formatINR(r.repriced.deltaPaise, { sign: true })})`
            : "Approved — it will apply to the next invoice",
    };
  }, ["/admin/fees/concessions", "/admin/fees/invoices", "/admin"]);
}

export async function waiveLateFeeAction(instalmentId: string, note: string): Promise<ActionResult> {
  const user = await actionUser("fees:waive");
  return run(async () => {
    await waiveLateFee(user, instalmentId, reason.parse(note));
    return { message: "Late fee waived" };
  }, ["/admin/fees/invoices", "/admin/fees/dues"]);
}

export async function updateRefundPolicyAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("fees:revise");
  const pct = (k: string) => Math.round(z.coerce.number().min(0).max(100).parse(form.get(k)) * 100);
  return run(async () => {
    await updateRefundPolicy(
      user,
      {
        newPupil: { beforeStartBp: pct("beforeStart"), afterStartBp: pct("afterStart") },
        existingPupil: {
          noticeDays: z.coerce.number().int().min(0).max(365).parse(form.get("noticeDays")),
          inLieuOfNoticeBp: pct("inLieu"),
        },
      },
      reason.parse(form.get("reason")),
    );
    return { message: "Refund policy updated. New quotes use it immediately." };
  }, ["/admin/fees/rules", "/admissions/fees/[boarding]"]);
}
