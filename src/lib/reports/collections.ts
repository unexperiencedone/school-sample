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
