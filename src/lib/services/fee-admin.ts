import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { sendTemplate } from "@/lib/notify";
import { computeInvoice, repriceForward, type InvoiceComputation, type RefundPolicy } from "@/lib/fee-engine";
import {
  structureInclude,
  toConcessionDef,
  toPlanDef,
  toStructureDef,
  type StructureWithLines,
} from "./fee-data";
import { guardiansFor, studentContext } from "./invoices";
import { refreshInvoice } from "./ledger";
import type { Effect } from "./payments";

/**
 * Fee administration: versioned structure revisions with an impact preview, forward repricing of open invoices,
 * concession approvals and late-fee waivers. Every change is permission-checked here and audit-logged with a
 * reason — the UI is a convenience, not the control.
 */

type Actor = { id: string; role: Role };
const OPEN_STATUSES = ["OPEN", "PARTIAL", "OVERDUE"] as const;

/* ───────────────────────────── Revisions ───────────────────────────── */

export type LineEdit = { feeHeadId: string; amountPaise: number };

/** Starts (or replaces the lines of) the draft revision of a structure, copied from its active version. */
export async function saveDraftRevision(
  actor: Actor,
  activeId: string,
  input: { lines: LineEdit[]; reason: string; effectiveFrom: Date },
) {
  assertCan(actor.role, "fees:revise");
  if (input.reason.trim().length < 5)
    throw new ApiError(422, "VALIDATION", "Give a reason for the revision.");
  for (const l of input.lines)
    if (!Number.isSafeInteger(l.amountPaise) || l.amountPaise < 0)
      throw new ApiError(422, "VALIDATION", "Amounts must be whole rupees and paise, not negative.");
  const active = await db.feeStructure.findUniqueOrThrow({
    where: { id: activeId },
    include: structureInclude,
  });
  if (active.status !== "ACTIVE")
    throw new ApiError(409, "NOT_ACTIVE", "Revise the active version of a structure.");
  const key = { yearId: active.yearId, band: active.band, boardingType: active.boardingType };
  return db.$transaction(async (tx) => {
    const existing = await tx.feeStructure.findFirst({ where: { ...key, status: "DRAFT" } });
    const max = await tx.feeStructure.aggregate({ where: key, _max: { version: true } });
    const draft = existing
      ? await tx.feeStructure.update({
          where: { id: existing.id },
          data: { reason: input.reason.trim(), effectiveFrom: input.effectiveFrom },
        })
      : await tx.feeStructure.create({
          data: {
            ...key,
            version: (max._max.version ?? 0) + 1,
            status: "DRAFT",
            effectiveFrom: input.effectiveFrom,
            reason: input.reason.trim(),
            createdById: actor.id,
          },
        });
    await tx.feeStructureLine.deleteMany({ where: { structureId: draft.id } });
    const amounts = new Map(input.lines.map((l) => [l.feeHeadId, l.amountPaise]));
    await tx.feeStructureLine.createMany({
      data: active.lines
        .map((l) => ({
          structureId: draft.id,
          feeHeadId: l.feeHeadId,
          amountPaise: amounts.get(l.feeHeadId) ?? l.amountPaise,
        }))
        .filter((l) => l.amountPaise > 0 || amounts.has(l.feeHeadId)),
    });
    await audit(
      {
        actor,
        action: "fee_structure.draft",
        entity: "FeeStructure",
        entityId: draft.id,
        before: active.lines.map((l) => ({ head: l.feeHead.code, amountPaise: l.amountPaise })),
        after: input.lines,
        reason: input.reason,
      },
      tx,
    );
    return draft;
  });
}

export async function discardDraft(actor: Actor, draftId: string, reason: string) {
  assertCan(actor.role, "fees:revise");
  const draft = await db.feeStructure.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status !== "DRAFT") throw new ApiError(409, "NOT_DRAFT", "Only drafts can be discarded.");
  await db.$transaction(async (tx) => {
    await tx.feeStructure.delete({ where: { id: draftId } });
    await audit(
      { actor, action: "fee_structure.discard", entity: "FeeStructure", entityId: draftId, reason },
      tx,
    );
  });
}

type OpenInvoice = Prisma.InvoiceGetPayload<{
  include: {
    plan: { include: { parts: true } };
    instalments: true;
    student: { select: { id: true; firstName: true; lastName: true; class: { select: { name: true } } } };
  };
}>;

/** Recomputes one invoice against a structure version, using the invoice's own plan, date and the student's context. */
async function recompute(
  client: Tx | typeof db,
  inv: OpenInvoice,
  structure: StructureWithLines,
): Promise<InvoiceComputation> {
  const [concessions, rebate, context] = await Promise.all([
    client.concession.findMany({ where: { active: true } }),
    client.advanceRebate.findFirst({ where: { yearId: inv.yearId, active: true } }),
    studentContext(client, inv.studentId, inv.yearId),
  ]);
  return computeInvoice({
    structure: toStructureDef(structure),
    plan: toPlanDef(inv.plan),
    concessions: concessions.map(toConcessionDef),
    student: context,
    // An invoice keeps the rebate decision it was issued with (forfeiture is the nightly job's business)
    rebate:
      rebate && inv.rebatePaise > 0 ? { amountPaise: rebate.amountPaise, payByDate: rebate.payByDate } : null,
    asOf: inv.issuedAt,
  });
}

const forwardState = (inv: OpenInvoice) => ({
  totalPaise: inv.totalPaise,
  instalments: inv.instalments.map((i) => ({
    seq: i.seq,
    amountPaise: i.amountPaise,
    principalPaidPaise: Math.min(i.paidPaise, i.amountPaise),
  })),
});

const openInvoiceInclude = {
  plan: { include: { parts: true } },
  instalments: { orderBy: { seq: "asc" as const } },
  student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
} satisfies Prisma.InvoiceInclude;

export type RevisionImpact = {
  draft: StructureWithLines;
  active: StructureWithLines;
  heads: { code: string; name: string; oldPaise: number; newPaise: number; deltaPaise: number }[];
  invoices: {
    id: string;
    number: string;
    student: string;
    className: string;
    oldTotalPaise: number;
    newTotalPaise: number;
    deltaPaise: number;
    walletCreditPaise: number;
  }[];
  summary: { invoices: number; deltaPaise: number; creditPaise: number; paidInFull: number };
};

/** What publishing a draft would change: head-by-head diff, and every open invoice repriced forwards. */
export async function revisionImpact(draftId: string): Promise<RevisionImpact> {
  const draft = await db.feeStructure.findUniqueOrThrow({
    where: { id: draftId },
    include: structureInclude,
  });
  const active = await db.feeStructure.findFirstOrThrow({
    where: { yearId: draft.yearId, band: draft.band, boardingType: draft.boardingType, status: "ACTIVE" },
    include: structureInclude,
  });
  const codes = new Map<string, { name: string; order: number }>();
  for (const l of [...active.lines, ...draft.lines])
    codes.set(l.feeHead.code, { name: l.feeHead.name, order: l.feeHead.order });
  const amount = (s: StructureWithLines, code: string) =>
    s.lines.find((l) => l.feeHead.code === code)?.amountPaise ?? 0;
  const heads = [...codes.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([code, h]) => ({
      code,
      name: h.name,
      oldPaise: amount(active, code),
      newPaise: amount(draft, code),
      deltaPaise: amount(draft, code) - amount(active, code),
    }));
  const [open, paidInFull] = await Promise.all([
    db.invoice.findMany({
      where: { structureId: active.id, status: { in: [...OPEN_STATUSES] } },
      include: openInvoiceInclude,
      orderBy: { number: "asc" },
    }),
    db.invoice.count({ where: { structureId: active.id, status: "PAID" } }),
  ]);
  const invoices = [];
  for (const inv of open) {
    const r = repriceForward(forwardState(inv), await recompute(db, inv, draft));
    invoices.push({
      id: inv.id,
      number: inv.number,
      student: `${inv.student.firstName} ${inv.student.lastName}`,
      className: inv.student.class.name,
      oldTotalPaise: r.oldTotalPaise,
      newTotalPaise: r.newTotalPaise,
      deltaPaise: r.deltaPaise,
      walletCreditPaise: r.walletCreditPaise,
    });
  }
  return {
    draft,
    active,
    heads,
    invoices,
    summary: {
      invoices: invoices.length,
      deltaPaise: invoices.reduce((a, i) => a + i.deltaPaise, 0),
      creditPaise: invoices.reduce((a, i) => a + i.walletCreditPaise, 0),
      paidInFull,
    },
  };
}

/**
 * Reprices one open invoice forwards inside a transaction: new lines, totals and breakdown; settled instalments
 * untouched; principal no longer needed credited to the wallet. Returns the before/after totals.
 */
async function repriceInTx(
  tx: Tx,
  invoiceId: string,
  structure: StructureWithLines,
  actor: Actor,
  reason: string,
): Promise<{ deltaPaise: number; creditPaise: number }> {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: openInvoiceInclude });
  const c = await recompute(tx, inv, structure);
  const r = repriceForward(forwardState(inv), c);
  if (r.deltaPaise === 0 && inv.structureId === structure.id) return { deltaPaise: 0, creditPaise: 0 };
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });
  await tx.invoiceLine.createMany({
    data: c.lines.map((l) => ({
      invoiceId,
      kind: l.kind,
      feeHeadCode: l.headCode,
      description: l.description,
      amountPaise: l.amountPaise,
      meta: (l.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });
  for (const i of r.instalments) {
    const row = inv.instalments.find((x) => x.seq === i.seq);
    if (!row || i.locked) continue;
    // Late-fee payments stay with their instalment; only the principal part is re-pointed
    const lateFeePaid = Math.max(0, row.paidPaise - row.amountPaise);
    await tx.instalment.update({
      where: { id: row.id },
      data: { amountPaise: i.amountPaise, paidPaise: i.principalPaidPaise + lateFeePaid },
    });
  }
  if (r.walletCreditPaise > 0)
    await tx.walletEntry.create({
      data: {
        studentId: inv.studentId,
        amountPaise: r.walletCreditPaise,
        reason: `Credit from fee revision on ${inv.number} (v${structure.version})`,
      },
    });
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      structureId: structure.id,
      subtotalPaise: c.subtotalPaise,
      discountPaise: c.discountPaise,
      rebatePaise: c.rebatePaise,
      totalPaise: c.totalPaise,
      breakdown: {
        steps: c.breakdown,
        applied: c.applied,
        skipped: c.skipped,
        structureVersion: c.structureVersion,
        repricedAt: new Date().toISOString(),
        repriceReason: reason,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await refreshInvoice(tx, invoiceId);
  await audit(
    {
      actor,
      action: "invoice.reprice",
      entity: "Invoice",
      entityId: invoiceId,
      before: { totalPaise: r.oldTotalPaise, structureId: inv.structureId },
      after: {
        totalPaise: r.newTotalPaise,
        structureId: structure.id,
        walletCreditPaise: r.walletCreditPaise,
      },
      reason,
    },
    tx,
  );
  return { deltaPaise: r.deltaPaise, creditPaise: r.walletCreditPaise };
}

/**
 * Publishes a draft: the active version is superseded, the draft becomes active (the website and new invoices
 * use it immediately), and — if chosen — every open invoice on the old version is repriced forwards and the family
 * is sent a revised invoice. One transaction: either all of it happens or none of it.
 */
export async function publishRevision(
  actor: Actor,
  draftId: string,
  opts: { reprice: boolean; reason: string },
) {
  assertCan(actor.role, "fees:revise");
  if (opts.reason.trim().length < 5) throw new ApiError(422, "VALIDATION", "Give a reason for publishing.");
  const draft = await db.feeStructure.findUniqueOrThrow({
    where: { id: draftId },
    include: structureInclude,
  });
  if (draft.status !== "DRAFT")
    throw new ApiError(409, "NOT_DRAFT", "This version has already been published.");
  const effects: Effect[] = [];
  const result = await db.$transaction(
    async (tx) => {
      const active = await tx.feeStructure.findFirstOrThrow({
        where: { yearId: draft.yearId, band: draft.band, boardingType: draft.boardingType, status: "ACTIVE" },
      });
      await tx.feeStructure.update({ where: { id: active.id }, data: { status: "SUPERSEDED" } });
      await tx.feeStructure.update({ where: { id: draft.id }, data: { status: "ACTIVE" } });
      let repriced = 0;
      let deltaPaise = 0;
      let creditPaise = 0;
      if (opts.reprice) {
        const open = await tx.invoice.findMany({
          where: { structureId: active.id, status: { in: [...OPEN_STATUSES] } },
          select: { id: true },
        });
        for (const { id } of open) {
          const r = await repriceInTx(tx, id, draft, actor, `Fee revision v${draft.version}: ${opts.reason}`);
          repriced++;
          deltaPaise += r.deltaPaise;
          creditPaise += r.creditPaise;
          effects.push(...(await revisedInvoiceNotice(tx, id)));
        }
      }
      await audit(
        {
          actor,
          action: "fee_structure.publish",
          entity: "FeeStructure",
          entityId: draft.id,
          before: { activeVersion: active.version },
          after: { activeVersion: draft.version, repriced, deltaPaise, creditPaise },
          reason: opts.reason,
        },
        tx,
      );
      return { version: draft.version, repriced, deltaPaise, creditPaise };
    },
    { timeout: 120_000 },
  );
  for (const e of effects) await e().catch(() => undefined);
  return result;
}

async function revisedInvoiceNotice(tx: Tx, invoiceId: string): Promise<Effect[]> {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { student: true, year: true, instalments: { orderBy: { seq: "asc" } } },
  });
  const g = (await guardiansFor(tx, inv.studentId))[0];
  if (!g) return [];
  const next = inv.instalments.find((i) => i.paidPaise < i.amountPaise);
  return [
    () =>
      sendTemplate({
        template: "fee-invoice",
        to: {
          email: g.email,
          phone: g.phone,
          consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
        },
        data: {
          parentName: g.name,
          number: `${inv.number} (revised)`,
          studentName: `${inv.student.firstName} ${inv.student.lastName}`,
          year: inv.year.name,
          total: formatINR(inv.totalPaise),
          firstDue: next
            ? `${formatINR(next.amountPaise - next.paidPaise)} on ${formatDate(next.dueDate)}`
            : "Nothing further due",
        },
        channels: ["EMAIL"],
        related: { type: "invoice", id: inv.id },
      }).then(() => undefined),
  ];
}

/* ───────────────────────────── Concessions ───────────────────────────── */

export async function requestConcession(
  actor: Actor,
  input: {
    studentId: string;
    concessionId: string;
    yearId: string;
    reason: string;
    overrideBp?: number | null;
  },
) {
  assertCan(actor.role, "concessions:request");
  const concession = await db.concession.findUniqueOrThrow({ where: { id: input.concessionId } });
  if (concession.automatic)
    throw new ApiError(409, "AUTOMATIC", "This concession is applied automatically when eligible.");
  if (input.overrideBp != null && (input.overrideBp < 0 || input.overrideBp > 10_000))
    throw new ApiError(422, "VALIDATION", "Override must be between 0% and 100%.");
  const row = await db.studentConcession.upsert({
    where: {
      studentId_concessionId_yearId: {
        studentId: input.studentId,
        concessionId: input.concessionId,
        yearId: input.yearId,
      },
    },
    create: { ...input, overrideBp: input.overrideBp ?? null, status: "REQUESTED" },
    update: {
      status: "REQUESTED",
      reason: input.reason,
      overrideBp: input.overrideBp ?? null,
      decidedAt: null,
      decidedById: null,
    },
  });
  await audit({
    actor,
    action: "concession.request",
    entity: "StudentConcession",
    entityId: row.id,
    after: input,
    reason: input.reason,
  });
  return row;
}

/**
 * Approves or rejects a concession request (maker–checker: the requester can't approve their own request). Approval
 * reprices the student's open invoice for that year forwards, so the discount lands on what is still to pay.
 */
export async function decideConcession(
  actor: Actor,
  id: string,
  decision: "APPROVED" | "REJECTED",
  reason: string,
) {
  assertCan(actor.role, "concessions:approve");
  const sc = await db.studentConcession.findUniqueOrThrow({ where: { id }, include: { concession: true } });
  if (sc.status !== "REQUESTED") throw new ApiError(409, "DECIDED", "This request has already been decided.");
  const requestedBy = await db.auditLog.findFirst({
    where: { entity: "StudentConcession", entityId: id, action: "concession.request" },
    orderBy: { createdAt: "desc" },
  });
  if (requestedBy?.actorId === actor.id)
    throw new ApiError(403, "MAKER_CHECKER", "Someone other than the requester must decide this.");
  return db.$transaction(
    async (tx) => {
      await tx.studentConcession.update({
        where: { id },
        data: { status: decision, decidedById: actor.id, decidedAt: new Date() },
      });
      let repriced: { deltaPaise: number; creditPaise: number } | null = null;
      if (decision === "APPROVED") {
        const inv = await tx.invoice.findFirst({
          where: { studentId: sc.studentId, yearId: sc.yearId, status: { in: [...OPEN_STATUSES] } },
          include: { structure: { include: structureInclude } },
        });
        if (inv)
          repriced = await repriceInTx(
            tx,
            inv.id,
            inv.structure,
            actor,
            `${sc.concession.name} approved: ${reason}`,
          );
      }
      await audit(
        {
          actor,
          action: decision === "APPROVED" ? "concession.approve" : "concession.reject",
          entity: "StudentConcession",
          entityId: id,
          after: { concession: sc.concession.code, repriced },
          reason,
        },
        tx,
      );
      return { repriced };
    },
    { timeout: 30_000 },
  );
}

/* ───────────────────────────── Waivers & rules ───────────────────────────── */

export async function waiveLateFee(actor: Actor, instalmentId: string, reason: string) {
  assertCan(actor.role, "fees:waive");
  if (reason.trim().length < 5) throw new ApiError(422, "VALIDATION", "Give a reason for the waiver.");
  const inst = await db.instalment.findUniqueOrThrow({ where: { id: instalmentId } });
  if (inst.lateFeeWaived) throw new ApiError(409, "ALREADY", "The late fee is already waived.");
  await db.$transaction(async (tx) => {
    await tx.instalment.update({
      where: { id: instalmentId },
      data: { lateFeeWaived: true, waiveReason: reason },
    });
    await refreshInvoice(tx, inst.invoiceId);
    await audit(
      {
        actor,
        action: "late_fee.waive",
        entity: "Instalment",
        entityId: instalmentId,
        before: { lateFeePaise: inst.lateFeePaise },
        after: { lateFeeWaived: true },
        reason,
      },
      tx,
    );
  });
}

export async function updateLateFeeRule(
  actor: Actor,
  input: { ratePerMonthBp: number; graceDays: number; cancelFlagAfterDays: number | null; reason: string },
) {
  assertCan(actor.role, "fees:revise");
  const rule = await db.lateFeeRule.findFirstOrThrow({ where: { active: true } });
  const after = await db.lateFeeRule.update({
    where: { id: rule.id },
    data: {
      ratePerMonthBp: input.ratePerMonthBp,
      graceDays: input.graceDays,
      cancelFlagAfterDays: input.cancelFlagAfterDays,
    },
  });
  await audit({
    actor,
    action: "late_fee_rule.update",
    entity: "LateFeeRule",
    entityId: rule.id,
    before: rule,
    after,
    reason: input.reason,
  });
}

export async function updateRebate(
  actor: Actor,
  rebateId: string,
  input: { amountPaise: number; payByDate: Date; active: boolean; reason: string },
) {
  assertCan(actor.role, "fees:revise");
  const before = await db.advanceRebate.findUniqueOrThrow({ where: { id: rebateId } });
  const after = await db.advanceRebate.update({
    where: { id: rebateId },
    data: { amountPaise: input.amountPaise, payByDate: input.payByDate, active: input.active },
  });
  await audit({
    actor,
    action: "rebate.update",
    entity: "AdvanceRebate",
    entityId: rebateId,
    before,
    after,
    reason: input.reason,
  });
}

export async function updateFeeHead(
  actor: Actor,
  id: string,
  input: { name: string; refundable: boolean; active: boolean; reason: string },
) {
  assertCan(actor.role, "fees:revise");
  const before = await db.feeHead.findUniqueOrThrow({ where: { id } });
  const after = await db.feeHead.update({
    where: { id },
    data: { name: input.name.trim(), refundable: input.refundable, active: input.active },
  });
  await audit({
    actor,
    action: "fee_head.update",
    entity: "FeeHead",
    entityId: id,
    before,
    after,
    reason: input.reason,
  });
}

export async function updateRefundPolicy(actor: Actor, policy: RefundPolicy, reason: string) {
  assertCan(actor.role, "fees:revise");
  const before = await db.setting.findUnique({ where: { key: "refund_policy" } });
  for (const v of [
    policy.newPupil.beforeStartBp,
    policy.newPupil.afterStartBp,
    policy.existingPupil.inLieuOfNoticeBp,
  ])
    if (!Number.isInteger(v) || v < 0 || v > 10_000)
      throw new ApiError(422, "VALIDATION", "Percentages must be 0–100.");
  await db.setting.upsert({
    where: { key: "refund_policy" },
    create: { key: "refund_policy", value: policy as unknown as Prisma.InputJsonValue },
    update: { value: policy as unknown as Prisma.InputJsonValue },
  });
  await audit({
    actor,
    action: "refund_policy.update",
    entity: "Setting",
    entityId: "refund_policy",
    before: before?.value,
    after: policy,
    reason,
  });
}
