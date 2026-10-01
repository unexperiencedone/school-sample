import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentMethod, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { allocatePayment, outstanding, quoteRefund, type PaidHead, type RefundQuote } from "@/lib/fee-engine";
import { getPaymentAdapter } from "@/integrations/payments";
import { refundPolicy } from "./fee-data";
import { onFeePaymentRecorded } from "./invoices";
import { recordPayment, toInstalmentState } from "./ledger";
import { sendTemplate } from "@/lib/notify";
import { formatINR } from "@/lib/money";
import { guardiansFor } from "./invoices";

type Actor = { id: string; role: Role };
export const MANUAL_METHODS = [
  "CASH",
  "CHEQUE",
  "DEMAND_DRAFT",
  "BANK_TRANSFER",
] as const satisfies readonly PaymentMethod[];

/* ───────────────────────────── Manual payments ───────────────────────────── */

async function openInstalments(studentId: string) {
  return db.instalment.findMany({
    where: {
      invoice: { studentId, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
      status: { not: "WAIVED" },
    },
    include: { invoice: { select: { number: true } } },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
  });
}

/** Where a payment of this amount would go — the same pure allocation the ledger uses, run without writing. */
export async function allocationPreview(
  studentId: string,
  amountPaise: number,
  instalmentId?: string | null,
) {
  const rows = await openInstalments(studentId);
  const r = allocatePayment({
    amountPaise,
    instalments: rows.map(toInstalmentState),
    instalmentId: instalmentId ?? null,
  });
  return {
    lines: r.allocations.map((a) => {
      const row = rows.find((x) => x.id === a.instalmentId)!;
      return {
        instalmentId: a.instalmentId,
        label: `${row.invoice.number} · ${row.label}`,
        amountPaise: a.amountPaise,
      };
    }),
    walletCreditPaise: r.unallocatedPaise,
    outstandingPaise: rows.reduce((a, i) => a + outstanding(toInstalmentState(i)), 0),
  };
}

/**
 * Records an offline payment (cash, cheque, demand draft, bank transfer) exactly like a gateway payment: allocated
 * oldest-due first (or to a chosen instalment), a gap-free receipt, the family notified, and an audit entry.
 * `clientKey` makes a double-submitted form record once.
 */
export async function recordManualPayment(
  actor: Actor,
  input: {
    studentId: string;
    amountPaise: number;
    method: (typeof MANUAL_METHODS)[number];
    reference?: string | null;
    receivedAt: Date;
    instalmentId?: string | null;
    notes?: string | null;
    clientKey: string;
  },
) {
  assertCan(actor.role, "payments:record");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new ApiError(422, "VALIDATION", "Enter an amount greater than zero.");
  if (input.receivedAt.getTime() > Date.now() + 60_000)
    throw new ApiError(422, "VALIDATION", "The date can't be in the future.");
  if (input.method !== "CASH" && !input.reference?.trim())
    throw new ApiError(422, "VALIDATION", "Enter the cheque, DD or bank reference.");
  const effects: (() => Promise<void>)[] = [];
  const result = await db.$transaction(async (tx) => {
    const r = await recordPayment(tx, {
      provider: "manual",
      providerPaymentId: `manual_${input.clientKey}`,
      method: input.method,
      amountPaise: input.amountPaise,
      receivedAt: input.receivedAt,
      studentId: input.studentId,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      recordedById: actor.id,
      allocate: { instalmentId: input.instalmentId ?? null },
    });
    if (!r.duplicate) {
      const order = { studentId: input.studentId, customer: {} } as Parameters<
        typeof onFeePaymentRecorded
      >[1];
      effects.push(...(await onFeePaymentRecorded(tx, order, r.payment, r.receipt!)));
      await audit(
        {
          actor,
          action: "payment.record_manual",
          entity: "Payment",
          entityId: r.payment.id,
          after: {
            amountPaise: input.amountPaise,
            method: input.method,
            reference: input.reference,
            receipt: r.receipt?.number,
          },
        },
        tx,
      );
    }
    return r;
  });
  for (const e of effects) await e().catch(() => undefined);
  return result;
}

/* ───────────────────────────── Refunds ───────────────────────────── */

/** What each fee head has actually been paid for a student in a year: paid share of each invoice spread over its lines. */
async function paidByHead(studentId: string, yearId: string): Promise<PaidHead[]> {
  const [invoices, heads] = await Promise.all([
    db.invoice.findMany({ where: { studentId, yearId, status: { not: "VOID" } }, include: { lines: true } }),
    db.feeHead.findMany(),
  ]);
  const map = new Map<string, PaidHead>();
  for (const inv of invoices) {
    const charges = inv.lines.filter((l) => l.kind === "CHARGE" && l.feeHeadCode);
    const net = inv.totalPaise || 1;
    const share = Math.min(1, inv.paidPaise / net);
    for (const l of charges) {
      // Discounts reduce each head in proportion; the paid share then applies to the net head amount
      const netHead = Math.round(l.amountPaise * (inv.totalPaise / Math.max(1, inv.subtotalPaise)));
      const head = heads.find((h) => h.code === l.feeHeadCode);
      const row = map.get(l.feeHeadCode!) ?? {
        headCode: l.feeHeadCode!,
        name: head?.name ?? l.description,
        refundable: head?.refundable ?? false,
        paidPaise: 0,
      };
      row.paidPaise += Math.round(netHead * share);
      map.set(l.feeHeadCode!, row);
    }
  }
  return [...map.values()];
}

/** The policy quote for a withdrawing pupil — used to pre-fill and justify a refund request. */
export async function refundQuoteFor(
  studentId: string,
  input: { withdrawalDate: Date; noticeGivenDays: number },
): Promise<RefundQuote & { yearName: string }> {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const year = await db.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const [paid, policy, refunded, priorYears] = await Promise.all([
    paidByHead(studentId, year.id),
    refundPolicy(),
    db.refund.aggregate({
      where: { payment: { studentId }, status: { in: ["APPROVED", "PROCESSED"] } },
      _sum: { amountPaise: true },
    }),
    db.invoice.count({ where: { studentId, yearId: { not: year.id }, status: { not: "VOID" } } }),
  ]);
  const q = quoteRefund({
    pupil: priorYears === 0 && student.admittedOn >= year.startDate ? "NEW" : "EXISTING",
    paid,
    withdrawalDate: input.withdrawalDate,
    yearStart: year.startDate,
    yearEnd: year.endDate,
    noticeGivenDays: input.noticeGivenDays,
    alreadyRefundedPaise: refunded._sum.amountPaise ?? 0,
    policy,
  });
  return { ...q, yearName: year.name };
}

export async function requestRefund(
  actor: Actor,
  input: { paymentId: string; amountPaise: number; reason: string; policy?: unknown; clientKey: string },
) {
  assertCan(actor.role, "refunds:request");
  if (input.reason.trim().length < 5)
    throw new ApiError(422, "VALIDATION", "Explain why this refund is due.");
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: input.paymentId },
    include: { refunds: true },
  });
  if (payment.status === "FAILED")
    throw new ApiError(409, "FAILED_PAYMENT", "A failed payment can't be refunded.");
  const committed = payment.refunds
    .filter((r) => ["REQUESTED", "APPROVED", "PROCESSED"].includes(r.status))
    .reduce((a, r) => a + r.amountPaise, 0);
  const available = payment.amountPaise - committed;
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > available)
    throw new ApiError(
      422,
      "VALIDATION",
      `You can refund at most ${formatINR(available)} from this payment.`,
    );
  const refund = await db.refund.upsert({
    where: { idempotencyKey: `req_${input.clientKey}` },
    create: {
      paymentId: payment.id,
      amountPaise: input.amountPaise,
      reason: input.reason.trim(),
      status: "REQUESTED",
      policy: (input.policy ?? undefined) as never,
      idempotencyKey: `req_${input.clientKey}`,
      requestedById: actor.id,
    },
    update: {},
  });
  await audit({
    actor,
    action: "refund.request",
    entity: "Refund",
    entityId: refund.id,
    after: { amountPaise: input.amountPaise },
    reason: input.reason,
  });
  return refund;
}

/** Approve or reject. Maker–checker: the person who requested a refund can never approve it. */
export async function decideRefund(
  actor: Actor,
  refundId: string,
  decision: "APPROVED" | "REJECTED",
  note: string,
) {
  assertCan(actor.role, "refunds:approve");
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (refund.status !== "REQUESTED")
    throw new ApiError(409, "DECIDED", "This refund has already been decided.");
  if (refund.requestedById === actor.id)
    throw new ApiError(403, "MAKER_CHECKER", "Someone other than the requester must approve a refund.");
  const after = await db.refund.update({
    where: { id: refundId },
    data: { status: decision, approvedById: actor.id, decidedAt: new Date(), note: note.trim() || null },
  });
  await audit({
    actor,
    action: decision === "APPROVED" ? "refund.approve" : "refund.reject",
    entity: "Refund",
    entityId: refundId,
    reason: note,
  });
  return after;
}

/**
 * Pays an approved refund out. Gateway payments go back through the provider's refund API (idempotency key = the
 * refund id, so a retry never refunds twice); offline payments are paid by bank transfer and the reference recorded.
 */
export async function processRefund(actor: Actor, refundId: string, input: { reference?: string | null }) {
  assertCan(actor.role, "payments:record");
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (refund.status === "PROCESSED") return refund;
  if (refund.status !== "APPROVED")
    throw new ApiError(409, "NOT_APPROVED", "Only approved refunds can be paid out.");
  let providerRefundId: string;
  let processed = true;
  if (refund.payment.provider === "manual") {
    if (!input.reference?.trim())
      throw new ApiError(422, "VALIDATION", "Enter the bank transfer reference for the refund.");
    providerRefundId = `manual_${input.reference.trim()}`;
  } else {
    const r = await getPaymentAdapter(refund.payment.provider).refund({
      paymentId: refund.payment.providerPaymentId,
      amountPaise: refund.amountPaise,
      reason: refund.reason,
      idempotencyKey: refund.id,
    });
    if (r.status === "failed") {
      await db.refund.update({
        where: { id: refundId },
        data: { status: "FAILED", note: "Gateway rejected the refund" },
      });
      throw new ApiError(
        502,
        "GATEWAY",
        "The payment gateway rejected the refund. It has been marked failed.",
      );
    }
    providerRefundId = r.refundId;
    processed = r.status === "processed";
  }
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: refundId },
      data: processed
        ? { status: "PROCESSED", providerRefundId, processedAt: new Date() }
        : { providerRefundId }, // pending at the gateway: the refund.processed webhook completes it
    });
    if (processed) {
      const p = await tx.payment.update({
        where: { id: refund.paymentId },
        data: { refundedPaise: { increment: refund.amountPaise } },
      });
      await tx.payment.update({
        where: { id: p.id },
        data: { status: p.refundedPaise >= p.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
    }
    await audit(
      {
        actor,
        action: "refund.process",
        entity: "Refund",
        entityId: refundId,
        after: { providerRefundId, processed },
      },
      tx,
    );
    return updated;
  });
  if (processed && refund.payment.studentId) {
    const g = (await guardiansFor(db, refund.payment.studentId))[0];
    if (g)
      await sendTemplate({
        template: "refund-update",
        to: { email: g.email, phone: g.phone },
        data: {
          parentName: g.name,
          amount: formatINR(refund.amountPaise),
          status: "processed",
          note: "It should reach your account within 5–7 working days.",
        },
        related: { type: "refund", id: refund.id },
      }).catch(() => undefined);
  }
  return result;
}

export const newClientKey = () => randomUUID();
