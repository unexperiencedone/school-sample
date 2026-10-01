"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApplicationStage } from "@prisma/client";
import { actionUser } from "@/lib/auth/session";
import { moveStage, saveAssessment, verifyDocument, TRANSITIONS } from "@/lib/services/admissions";
import { previewInvoice } from "@/lib/services/invoices";
import { db } from "@/lib/db";
import type { ActionResult } from "../leads/actions";

const STAGES = Object.keys(TRANSITIONS) as [ApplicationStage, ...ApplicationStage[]];

function paths(id: string) {
  ["/admin/applications", "/admin/applications/list", `/admin/applications/${id}`, "/admin"].forEach((p) =>
    revalidatePath(p),
  );
}

export async function moveStageAction(
  id: string,
  to: string,
  note: string,
  extra: { planCode?: string; message?: string; sectionId?: string } = {},
): Promise<ActionResult> {
  const user = await actionUser("applications:write");
  try {
    const stage = z.enum(STAGES).parse(to);
    await moveStage(id, stage, user, note.trim() || undefined, {
      planCode:
        extra.planCode && ["ONE", "TWO", "THREE"].includes(extra.planCode) ? extra.planCode : undefined,
      message: extra.message?.slice(0, 1000),
      sectionId: extra.sectionId || undefined,
    });
    paths(id);
    return { ok: true, message: "Stage updated" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update" };
  }
}

export async function verifyDocumentAction(
  docId: string,
  status: "VERIFIED" | "REJECTED",
  note?: string,
): Promise<ActionResult> {
  const user = await actionUser("applications:write");
  try {
    const doc = await verifyDocument(
      docId,
      z.enum(["VERIFIED", "REJECTED"]).parse(status),
      user,
      note?.slice(0, 300),
    );
    paths(doc.applicationId);
    return { ok: true, message: status === "VERIFIED" ? "Verified" : "Marked for re-upload" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update" };
  }
}

const scoreSchema = z.object({
  at: z.string().optional(),
  english: z.coerce.number().min(0).max(100).optional(),
  maths: z.coerce.number().min(0).max(100).optional(),
  reasoning: z.coerce.number().min(0).max(100).optional(),
  interview: z.coerce.number().min(0).max(10).optional(),
  comments: z.string().max(2000).optional(),
  reviewNotes: z.string().max(4000).optional(),
});

export async function saveAssessmentAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("applications:write");
  const raw = Object.fromEntries(
    [...form.entries()].filter(([, v]) => v !== "").map(([k, v]) => [k, String(v)]),
  );
  const parsed = scoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Scores must be 0–100 (interview 0–10)" };
  const { at, reviewNotes, ...scores } = parsed.data;
  await saveAssessment(id, user, {
    at: at ? new Date(at.length === 16 ? `${at}:00+05:30` : at) : undefined,
    scores: Object.values(scores).some((v) => v !== undefined) ? scores : undefined,
    reviewNotes,
  });
  paths(id);
  return { ok: true, message: "Assessment saved" };
}

/** Preview of the first-year invoice an offer would create, per instalment plan (no writes). */
export async function previewOfferAction(id: string, planCode: string) {
  await actionUser("applications:decide");
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  const student = await db.student.findUnique({ where: { applicationId: id } });
  if (student) {
    const c = await previewInvoice(db, student.id, app.startYearId, planCode);
    return {
      totalPaise: c.totalPaise,
      instalments: c.instalments.map((i) => ({
        label: i.label,
        dueDate: i.dueDate.toISOString(),
        amountPaise: i.amountPaise,
      })),
    };
  }
  // No provisional student yet: price against the structure directly with new-admission defaults.
  const { computeInvoice } = await import("@/lib/fee-engine");
  const { structureInclude, toPlanDef, toStructureDef, toConcessionDef } =
    await import("@/lib/services/fee-data");
  const cls = await db.classLevel.findUniqueOrThrow({ where: { id: app.classId } });
  const [structure, plan, concessions] = await Promise.all([
    db.feeStructure.findFirst({
      where: { yearId: app.startYearId, band: cls.band, boardingType: app.boardingType, status: "ACTIVE" },
      include: structureInclude,
      orderBy: { version: "desc" },
    }),
    db.instalmentPlan.findFirst({
      where: { yearId: app.startYearId, code: planCode },
      include: { parts: true },
    }),
    db.concession.findMany({ where: { active: true } }),
  ]);
  if (!structure || !plan) return null;
  const c = computeInvoice({
    structure: toStructureDef(structure),
    plan: toPlanDef(plan),
    concessions: concessions.map(toConcessionDef),
    student: {
      siblingOrdinal: 1,
      isFoundingFamily: false,
      isStaffWard: false,
      isNewAdmission: true,
      granted: [],
    },
    asOf: new Date(),
  });
  return {
    totalPaise: c.totalPaise,
    instalments: c.instalments.map((i) => ({
      label: i.label,
      dueDate: i.dueDate.toISOString(),
      amountPaise: i.amountPaise,
    })),
  };
}
