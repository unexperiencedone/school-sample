import { daysBetween } from "@/lib/dates";
import { percentOf, sum } from "@/lib/money";
import type { RefundPolicy } from "./types";

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  newPupil: { beforeStartBp: 10_000, afterStartBp: 0 },
  existingPupil: { noticeDays: 90, inLieuOfNoticeBp: 3_333 },
};

export type PaidHead = { headCode: string; name: string; refundable: boolean; paidPaise: number };

export type RefundQuote = {
  refundablePaise: number;
  lines: { headCode: string; name: string; paidPaise: number; refundPaise: number; reason: string }[];
  notes: string[];
};

/**
 * Policy-driven refund quote. Non-refundable heads (registration, admission, …) are never refunded.
 *  NEW pupil (withdrawing before or just after joining): beforeStartBp / afterStartBp of refundable heads paid.
 *  EXISTING pupil: refundable heads × unconsumed share of the academic year, minus `inLieuOfNoticeBp`
 *  of refundable fees paid when less than `noticeDays` written notice was given.
 */
export function quoteRefund(input: {
  pupil: "NEW" | "EXISTING";
  paid: PaidHead[];
  withdrawalDate: Date;
  yearStart: Date;
  yearEnd: Date;
  noticeGivenDays: number;
  alreadyRefundedPaise?: number;
  policy?: RefundPolicy;
}): RefundQuote {
  const policy = input.policy ?? DEFAULT_REFUND_POLICY;
  const notes: string[] = [];
  const lines: RefundQuote["lines"] = [];

  if (input.pupil === "NEW") {
    const before = input.withdrawalDate < input.yearStart;
    const bp = before ? policy.newPupil.beforeStartBp : policy.newPupil.afterStartBp;
    notes.push(
      before
        ? `Withdrawn before the session starts: ${bp / 100}% of refundable fees.`
        : `Withdrawn after the session started: ${bp / 100}% of refundable fees.`,
    );
    for (const h of input.paid) {
      const refund = h.refundable ? percentOf(h.paidPaise, bp) : 0;
      lines.push({
        headCode: h.headCode,
        name: h.name,
        paidPaise: h.paidPaise,
        refundPaise: refund,
        reason: h.refundable ? `${bp / 100}%` : "non-refundable",
      });
    }
  } else {
    const total = Math.max(1, daysBetween(input.yearStart, input.yearEnd));
    const left = Math.min(total, Math.max(0, daysBetween(input.withdrawalDate, input.yearEnd)));
    const unconsumedBp = Math.round((left / total) * 10_000);
    notes.push(`${unconsumedBp / 100}% of the academic year remains unconsumed.`);
    for (const h of input.paid) {
      const refund = h.refundable ? percentOf(h.paidPaise, unconsumedBp) : 0;
      lines.push({
        headCode: h.headCode,
        name: h.name,
        paidPaise: h.paidPaise,
        refundPaise: refund,
        reason: h.refundable ? `${unconsumedBp / 100}% unconsumed` : "non-refundable",
      });
    }
    if (input.noticeGivenDays < policy.existingPupil.noticeDays) {
      const refundablePaid = sum(input.paid.filter((h) => h.refundable).map((h) => h.paidPaise));
      const deduction = percentOf(refundablePaid, policy.existingPupil.inLieuOfNoticeBp);
      notes.push(
        `Notice of ${input.noticeGivenDays} days is under ${policy.existingPupil.noticeDays}: fees in lieu of notice deducted.`,
      );
      lines.push({
        headCode: "IN_LIEU",
        name: "Fees in lieu of notice",
        paidPaise: 0,
        refundPaise: -deduction,
        reason: `${policy.existingPupil.inLieuOfNoticeBp / 100}% of refundable fees`,
      });
    }
  }

  const gross = Math.max(0, sum(lines.map((l) => l.refundPaise)));
  const totalPaid = sum(input.paid.map((h) => h.paidPaise));
  const refundablePaise = Math.max(0, Math.min(gross, totalPaid - (input.alreadyRefundedPaise ?? 0)));
  if (input.alreadyRefundedPaise) notes.push(`Previously refunded amounts are excluded.`);
  return { refundablePaise, lines, notes };
}
