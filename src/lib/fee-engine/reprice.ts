import { splitByWeights } from "@/lib/money";
import type { ComputedInstalment, InvoiceComputation } from "./types";

export type CurrentInvoice = {
  totalPaise: number;
  paidPaise: number;
  instalments: { seq: number; amountPaise: number; paidPaise: number }[];
};

export type RepriceResult = {
  oldTotalPaise: number;
  newTotalPaise: number;
  deltaPaise: number;
  instalments: (ComputedInstalment & { paidPaise: number; oldAmountPaise: number })[];
  walletCreditPaise: number;
};

/**
 * Reprices an open invoice against a recomputed structure without touching history:
 * payments already received are kept and re-spread oldest-first over the new instalment amounts;
 * if the new total is below what was already paid, the excess becomes a wallet credit.
 */
export function repriceInvoice(current: CurrentInvoice, next: InvoiceComputation): RepriceResult {
  let paidPool = current.paidPaise;
  const instalments = next.instalments.map((inst) => {
    const take = Math.min(paidPool, inst.amountPaise);
    paidPool -= take;
    const old = current.instalments.find((i) => i.seq === inst.seq);
    return { ...inst, paidPaise: take, oldAmountPaise: old?.amountPaise ?? 0 };
  });
  return {
    oldTotalPaise: current.totalPaise,
    newTotalPaise: next.totalPaise,
    deltaPaise: next.totalPaise - current.totalPaise,
    instalments,
    walletCreditPaise: paidPool,
  };
}

export type ForwardInstalment = { seq: number; amountPaise: number; principalPaidPaise: number };

export type ForwardRepriceResult = {
  oldTotalPaise: number;
  newTotalPaise: number;
  deltaPaise: number;
  /** New principal amount and principal paid per instalment (by seq). Late fees are untouched. */
  instalments: {
    seq: number;
    oldAmountPaise: number;
    amountPaise: number;
    principalPaidPaise: number;
    locked: boolean;
  }[];
  /** Principal already paid that the revised invoice no longer needs — credited to the family's wallet. */
  walletCreditPaise: number;
};

/**
 * Reprices an invoice **forwards**: instalments the family has already paid in full keep their amounts (a revision
 * never re-opens a settled instalment), and the revised total less those settled amounts is spread over the
 * remaining instalments in the proportions of the recomputed plan. Payments on the remaining instalments stay
 * where they are; any principal paid beyond a reduced amount, or beyond a reduced total, becomes a wallet credit.
 */
export function repriceForward(
  current: { totalPaise: number; instalments: ForwardInstalment[] },
  next: InvoiceComputation,
): ForwardRepriceResult {
  const bySeq = new Map(current.instalments.map((i) => [i.seq, i]));
  const locked = next.instalments.filter((n) => {
    const c = bySeq.get(n.seq);
    return !!c && c.amountPaise > 0 && c.principalPaidPaise >= c.amountPaise;
  });
  const open = next.instalments.filter((n) => !locked.includes(n));
  const lockedTotal = locked.reduce((a, n) => a + bySeq.get(n.seq)!.amountPaise, 0);
  const remaining = Math.max(0, next.totalPaise - lockedTotal);
  const weights = open.map((n) => n.amountPaise);
  const split =
    open.length === 0
      ? []
      : weights.some((w) => w > 0)
        ? splitByWeights(remaining, weights)
        : splitByWeights(
            remaining,
            open.map(() => 1),
          );
  let walletCreditPaise = Math.max(0, lockedTotal - next.totalPaise);
  const instalments = next.instalments.map((n) => {
    const c = bySeq.get(n.seq);
    const oldAmountPaise = c?.amountPaise ?? 0;
    if (locked.includes(n))
      return {
        seq: n.seq,
        oldAmountPaise,
        amountPaise: oldAmountPaise,
        principalPaidPaise: oldAmountPaise,
        locked: true,
      };
    const amountPaise = split[open.indexOf(n)]!;
    const paid = c?.principalPaidPaise ?? 0;
    walletCreditPaise += Math.max(0, paid - amountPaise);
    return {
      seq: n.seq,
      oldAmountPaise,
      amountPaise,
      principalPaidPaise: Math.min(paid, amountPaise),
      locked: false,
    };
  });
  return {
    oldTotalPaise: current.totalPaise,
    newTotalPaise: next.totalPaise,
    deltaPaise: next.totalPaise - current.totalPaise,
    instalments,
    walletCreditPaise,
  };
}
