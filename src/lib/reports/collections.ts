import type { OrderPurpose, PaymentMethod } from "@prisma/client";
import { splitByWeights } from "@/lib/money";

export type ChargeLine = { invoiceId: string; feeHeadCode: string | null; amountPaise: number };

/** Key for money that cannot be tied to a fee head (an invoice with no charge lines). */
export const NO_FEE_HEAD = "";

/**
 * Receipts are allocated to invoices, not to fee heads, so each invoice's allocated amount is spread over its
 * charge lines in proportion to their size. `splitByWeights` hands the odd paise to the largest remainders, so
 * the heads always add up to exactly what was allocated.
 */
export function apportionToFeeHeads(
  allocatedByInvoice: Map<string, number>,
  lines: ChargeLine[],
): Map<string, number> {
  const linesByInvoice = new Map<string, ChargeLine[]>();
  for (const l of lines) {
    if (l.amountPaise <= 0) continue;
    const list = linesByInvoice.get(l.invoiceId);
    if (list) list.push(l);
    else linesByInvoice.set(l.invoiceId, [l]);
  }
  const out = new Map<string, number>();
  const credit = (code: string, paise: number) => out.set(code, (out.get(code) ?? 0) + paise);
  for (const [invoiceId, allocated] of allocatedByInvoice) {
    if (allocated === 0) continue;
    const invoiceLines = linesByInvoice.get(invoiceId);
    if (!invoiceLines) {
      credit(NO_FEE_HEAD, allocated);
      continue;
    }
    const shares = splitByWeights(
      allocated,
      invoiceLines.map((l) => l.amountPaise),
    );
    invoiceLines.forEach((l, i) => credit(l.feeHeadCode ?? NO_FEE_HEAD, shares[i]!));
  }
  return out;
}

/** A payment as the collections report reads it. */
export type ReceiptRow = {
  method: PaymentMethod;
  receivedAt: Date;
  amountPaise: number;
  refundedPaise: number;
  /** Purpose of the gateway order the payment settled; null for a payment recorded by hand. */
  orderPurpose: OrderPurpose | null;
  allocations: { invoiceId: string; amountPaise: number }[];
};

/**
 * What a receipt is for. Only FEE receipts are fee collections: money allocated to invoices or instalments (plus
 * any overpayment on such a payment that was credited to the pupil's wallet). Registration fees and pocket-money
 * top-ups never touch an invoice, and a payment with no allocation at all has not paid any fee yet, so none of
 * them may lift the collected-against-billed figures.
 */
export type ReceiptKind = "FEE" | "REGISTRATION" | "IMPREST_TOPUP" | "UNALLOCATED";

export function classifyReceipt(r: Pick<ReceiptRow, "orderPurpose" | "allocations">): ReceiptKind {
  if (r.orderPurpose === "REGISTRATION") return "REGISTRATION";
  if (r.orderPurpose === "IMPREST_TOPUP") return "IMPREST_TOPUP";
  return r.allocations.length > 0 ? "FEE" : "UNALLOCATED";
}

export type ReceiptTotals = { receipts: number; gross: number; refunded: number };

const emptyTotals = (): ReceiptTotals => ({ receipts: 0, gross: 0, refunded: 0 });
const addTo = (t: ReceiptTotals, r: ReceiptRow) => {
  t.receipts += 1;
  t.gross += r.amountPaise;
  t.refunded += r.refundedPaise;
};

export type ReceiptSummary = {
  fee: ReceiptTotals;
  /** Fee receipts per month window, in the order the windows were given. */
  feeByMonth: ReceiptTotals[];
  feeByMethod: Map<PaymentMethod, ReceiptTotals>;
  /** Fee money allocated to each invoice. */
  allocatedByInvoice: Map<string, number>;
  /** Fee payments' amount beyond what was allocated, credited to the pupil's wallet. */
  walletCredit: number;
  other: Record<Exclude<ReceiptKind, "FEE">, ReceiptTotals>;
};

/**
 * Splits receipts into fee collections and the rest. Everything under `fee` ties out: the months, the methods,
 * and (allocated plus wallet credit) all add up to `fee.gross`.
 */
export function summariseReceipts(
  receipts: ReceiptRow[],
  months: readonly { start: Date; end: Date }[],
): ReceiptSummary {
  const out: ReceiptSummary = {
    fee: emptyTotals(),
    feeByMonth: months.map(emptyTotals),
    feeByMethod: new Map(),
    allocatedByInvoice: new Map(),
    walletCredit: 0,
    other: { REGISTRATION: emptyTotals(), IMPREST_TOPUP: emptyTotals(), UNALLOCATED: emptyTotals() },
  };
  for (const r of receipts) {
    const kind = classifyReceipt(r);
    if (kind !== "FEE") {
      addTo(out.other[kind], r);
      continue;
    }
    addTo(out.fee, r);
    const month = months.findIndex((m) => r.receivedAt >= m.start && r.receivedAt < m.end);
    if (month >= 0) addTo(out.feeByMonth[month]!, r);
    const method = out.feeByMethod.get(r.method) ?? emptyTotals();
    addTo(method, r);
    out.feeByMethod.set(r.method, method);
    let allocated = 0;
    for (const a of r.allocations) {
      allocated += a.amountPaise;
      out.allocatedByInvoice.set(a.invoiceId, (out.allocatedByInvoice.get(a.invoiceId) ?? 0) + a.amountPaise);
    }
    out.walletCredit += r.amountPaise - allocated;
  }
  return out;
}
