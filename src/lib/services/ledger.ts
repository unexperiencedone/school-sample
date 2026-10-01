import "server-only";
import type { PaymentMethod } from "@prisma/client";
import type { Tx } from "@/lib/db";
import {
  allocatePayment,
  formatReceiptNumber,
  instalmentStatus,
  invoiceStatus,
  type InstalmentState,
} from "@/lib/fee-engine";
import { financialYearOf } from "@/lib/dates";
import { school } from "@/config/school";

/**
 * Ledger primitives that must run inside a database transaction:
 * payment recording, allocation to instalments, wallet credits and gap-free receipt numbers.
 */

/** Next receipt number for the financial year. The counter row is locked by the UPDATE, so numbers are gap-free:
 *  if the surrounding transaction rolls back, the increment rolls back with it. */
export async function nextReceiptNumber(
  tx: Tx,
  at: Date,
): Promise<{ number: string; financialYear: string; seq: number }> {
  const financialYear = financialYearOf(at);
  const row = await tx.receiptSequence.upsert({
    where: { financialYear },
    create: { financialYear, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return {
    number: formatReceiptNumber(school.receiptPrefix, financialYear, row.lastSeq),
    financialYear,
    seq: row.lastSeq,
  };
}

export function toInstalmentState(i: {
  id: string;
  invoiceId: string;
  seq: number;
  dueDate: Date;
  amountPaise: number;
  lateFeePaise: number;
  lateFeeWaived: boolean;
  paidPaise: number;
}): InstalmentState {
  return {
    id: i.id,
    invoiceId: i.invoiceId,
    seq: i.seq,
    dueDate: i.dueDate,
    amountPaise: i.amountPaise,
    lateFeePaise: i.lateFeePaise,
    lateFeeWaived: i.lateFeeWaived,
    paidPaise: i.paidPaise,
  };
}

/** Recomputes instalment + invoice statuses and cached totals from their rows. */
export async function refreshInvoice(tx: Tx, invoiceId: string, asOf = new Date()): Promise<void> {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { instalments: true },
  });
  if (inv.status === "VOID" || inv.status === "WAIVED") return;
  for (const i of inv.instalments) {
    if (i.status === "WAIVED") continue;
    const status = instalmentStatus(toInstalmentState(i), asOf);
    if (status !== i.status) await tx.instalment.update({ where: { id: i.id }, data: { status } });
  }
  const states = inv.instalments.filter((i) => i.status !== "WAIVED").map(toInstalmentState);
  const paidPaise = inv.instalments.reduce((a, i) => a + i.paidPaise, 0);
  const lateFeePaise = inv.instalments.reduce((a, i) => a + (i.lateFeeWaived ? 0 : i.lateFeePaise), 0);
  const status = states.length ? invoiceStatus(states, asOf) : "PAID";
  await tx.invoice.update({ where: { id: invoiceId }, data: { paidPaise, lateFeePaise, status } });
}

/**
 * Allocates an amount across a student's open instalments (oldest due first, or a target invoice/instalment).
 * Writes allocations, bumps instalment.paidPaise, refreshes statuses, and credits any remainder to the wallet.
 */
export async function allocateToStudent(
  tx: Tx,
  input: {
    studentId: string;
    paymentId: string;
    amountPaise: number;
    invoiceId?: string | null;
    instalmentId?: string | null;
  },
): Promise<{ allocated: number; walletCredit: number }> {
  const open = await tx.instalment.findMany({
    where: {
      invoice: { studentId: input.studentId, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
      status: { not: "WAIVED" },
    },
  });
  const { allocations, unallocatedPaise } = allocatePayment({
    amountPaise: input.amountPaise,
    instalments: open.map(toInstalmentState),
    invoiceId: input.invoiceId,
    instalmentId: input.instalmentId,
  });
  const touched = new Set<string>();
  for (const a of allocations) {
    await tx.paymentAllocation.create({
      data: {
        paymentId: input.paymentId,
        invoiceId: a.invoiceId,
        instalmentId: a.instalmentId,
        amountPaise: a.amountPaise,
      },
    });
    await tx.instalment.update({
      where: { id: a.instalmentId },
      data: { paidPaise: { increment: a.amountPaise } },
    });
    touched.add(a.invoiceId);
  }
  for (const id of touched) await refreshInvoice(tx, id);
  if (unallocatedPaise > 0) {
    await tx.walletEntry.create({
      data: {
        studentId: input.studentId,
        amountPaise: unallocatedPaise,
        reason: "Unallocated payment credit",
        paymentId: input.paymentId,
      },
    });
  }
  return { allocated: input.amountPaise - unallocatedPaise, walletCredit: unallocatedPaise };
}

export type RecordPaymentInput = {
  provider: string;
  providerPaymentId: string;
  method: PaymentMethod;
  amountPaise: number;
  receivedAt?: Date;
  orderId?: string | null;
  studentId?: string | null;
  applicationId?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedById?: string | null;
  allocate?: { invoiceId?: string | null; instalmentId?: string | null } | false;
};

/**
 * Records one payment exactly once (unique providerPaymentId), allocates it, and issues a receipt.
 * Returns `duplicate: true` without side effects if the payment is already recorded.
 */
export async function recordPayment(tx: Tx, input: RecordPaymentInput) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new RangeError("Payment amount must be a positive number of paise");
  const existing = await tx.payment.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
    include: { receipt: true },
  });
  if (existing)
    return { payment: existing, receipt: existing.receipt, duplicate: true as const, walletCredit: 0 };

  const receivedAt = input.receivedAt ?? new Date();
  const payment = await tx.payment.create({
    data: {
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      orderId: input.orderId ?? undefined,
      studentId: input.studentId ?? undefined,
      applicationId: input.applicationId ?? undefined,
      method: input.method,
      amountPaise: input.amountPaise,
      reference: input.reference ?? undefined,
      notes: input.notes ?? undefined,
      recordedById: input.recordedById ?? undefined,
      receivedAt,
    },
  });
  let walletCredit = 0;
  if (input.studentId && input.allocate !== false) {
    walletCredit = (
      await allocateToStudent(tx, {
        studentId: input.studentId,
        paymentId: payment.id,
        amountPaise: input.amountPaise,
        ...(input.allocate || {}),
      })
    ).walletCredit;
  }
  const r = await nextReceiptNumber(tx, receivedAt);
  const receipt = await tx.receipt.create({
    data: {
      number: r.number,
      financialYear: r.financialYear,
      seq: r.seq,
      paymentId: payment.id,
      amountPaise: input.amountPaise,
      issuedAt: receivedAt,
    },
  });
  return { payment, receipt, duplicate: false as const, walletCredit };
}
