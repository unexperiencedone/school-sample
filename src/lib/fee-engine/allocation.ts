import type { InstalmentState } from "./types";

export type Allocation = { instalmentId: string; invoiceId: string; amountPaise: number };

export function outstanding(i: InstalmentState): number {
  return Math.max(0, i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise);
}

/**
 * Allocates a payment across open instalments.
 *  - default: oldest due date first (then invoice, then sequence)
 *  - `invoiceId`: only that invoice's instalments
 *  - `instalmentId`: that instalment first, then the rest of its invoice
 * Anything left over is returned as `unallocatedPaise` (credited to the student wallet by the caller).
 */
export function allocatePayment(input: {
  amountPaise: number;
  instalments: InstalmentState[];
  invoiceId?: string | null;
  instalmentId?: string | null;
}): { allocations: Allocation[]; unallocatedPaise: number } {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new RangeError("Payment amount must be a positive integer (paise)");
  let pool = input.instalments.filter((i) => outstanding(i) > 0);
  const target = input.instalmentId ? pool.find((i) => i.id === input.instalmentId) : undefined;
  const invoiceId = input.invoiceId ?? target?.invoiceId;
  if (invoiceId) pool = pool.filter((i) => i.invoiceId === invoiceId);
  pool.sort(
    (a, b) =>
      a.dueDate.getTime() - b.dueDate.getTime() || a.invoiceId.localeCompare(b.invoiceId) || a.seq - b.seq,
  );
  if (target) pool = [target, ...pool.filter((i) => i.id !== target.id)];

  let remaining = input.amountPaise;
  const allocations: Allocation[] = [];
  for (const inst of pool) {
    if (remaining === 0) break;
    const take = Math.min(remaining, outstanding(inst));
    allocations.push({ instalmentId: inst.id, invoiceId: inst.invoiceId, amountPaise: take });
    remaining -= take;
  }
  return { allocations, unallocatedPaise: remaining };
}

export type InstalmentStatusCode = "DUE" | "PARTIAL" | "PAID" | "OVERDUE" | "WAIVED";

export function instalmentStatus(i: InstalmentState, asOf: Date): InstalmentStatusCode {
  if (outstanding(i) === 0) return "PAID";
  if (asOf > i.dueDate) return "OVERDUE";
  return i.paidPaise > 0 ? "PARTIAL" : "DUE";
}

export type InvoiceStatusCode = "OPEN" | "PARTIAL" | "PAID" | "OVERDUE";

export function invoiceStatus(instalments: InstalmentState[], asOf: Date): InvoiceStatusCode {
  const statuses = instalments.map((i) => instalmentStatus(i, asOf));
  if (statuses.every((s) => s === "PAID")) return "PAID";
  if (statuses.includes("OVERDUE")) return "OVERDUE";
  return instalments.some((i) => i.paidPaise > 0) ? "PARTIAL" : "OPEN";
}
