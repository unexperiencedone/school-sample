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
