import { daysBetween } from "@/lib/dates";
import { percentOf } from "@/lib/money";
import type { InstalmentState, LateFeeRuleDef } from "./types";

/**
 * Late fee for one instalment as of a date: `ratePerMonthBp` per started 30-day month overdue,
 * charged on the outstanding principal (never on late fee itself), once beyond `graceDays`.
 * The value is absolute (not incremental), so the nightly job is idempotent; the job also never lowers an
 * already-charged fee (`Math.max`) so a later part-payment doesn't erase it. Waived instalments return 0.
 * `flagCancellation` is advisory only — the system never cancels a seat automatically.
 */
export function computeLateFee(inst: InstalmentState, rule: LateFeeRuleDef, asOf: Date) {
  const daysOverdue = Math.max(0, daysBetween(inst.dueDate, asOf));
  const principalOutstanding = Math.max(0, inst.amountPaise - inst.paidPaise);
  const flagCancellation =
    !!rule.cancelFlagAfterDays && principalOutstanding > 0 && daysOverdue > rule.cancelFlagAfterDays;
  if (inst.lateFeeWaived || principalOutstanding === 0 || daysOverdue <= rule.graceDays) {
    return { feePaise: 0, monthsCharged: 0, daysOverdue, flagCancellation };
  }
  const monthsCharged = Math.ceil(daysOverdue / 30);
  const feePaise = percentOf(principalOutstanding, rule.ratePerMonthBp * monthsCharged);
  return { feePaise, monthsCharged, daysOverdue, flagCancellation };
}

/** What the nightly job should store: never decrease a charged fee. */
export function nextLateFee(inst: InstalmentState, rule: LateFeeRuleDef, asOf: Date): number {
  if (inst.lateFeeWaived) return 0;
  return Math.max(inst.lateFeePaise, computeLateFee(inst, rule, asOf).feePaise);
}
