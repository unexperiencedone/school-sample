/** Ageing of unpaid instalments by days past the IST due date. */
export const AGEING_BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90_plus", label: "Over 90 days" },
] as const;

export type AgeingKey = (typeof AGEING_BUCKETS)[number]["key"];

/** Whole days between the due date and today; positive once the due date has passed, zero or negative before. */
export function daysPastDue(due: Date, today: Date): number {
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

/** An instalment is overdue the day after it falls due, so "due today" is still not yet due. */
export function ageingBucket(daysOverdue: number): AgeingKey {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

export type OpenInstalment = {
  dueDate: Date;
  amountPaise: number;
  lateFeePaise: number;
  lateFeeWaived: boolean;
  paidPaise: number;
};

/**
 * Splits what is still owed into principal and late fee so the two always add up to the instalment's outstanding
 * balance (principal + unwaived late fee − paid). Payments clear principal first.
 */
export function outstandingParts(i: OpenInstalment): { principal: number; lateFee: number; total: number } {
  const late = i.lateFeeWaived ? 0 : i.lateFeePaise;
  const total = i.amountPaise + late - i.paidPaise;
  const principal = Math.max(0, Math.min(total, i.amountPaise - i.paidPaise));
  return { principal, lateFee: total - principal, total };
}
