import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { computeLateFee, nextLateFee } from "@/lib/fee-engine";
import { formatDate, istDateOnly } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { retryDueOutbox, sendTemplate } from "@/lib/notify";
import { guardiansFor } from "./invoices";
import { refreshInvoice, toInstalmentState } from "./ledger";
import { sendTourReminders } from "./tours";

/**
 * Scheduled jobs, run by `/api/cron/*`. Each is idempotent: running it twice on the same day changes nothing the
 * second time, so a retried or doubled cron is harmless.
 */

const UNPAID: Prisma.InstalmentWhereInput = {
  status: { notIn: ["PAID", "WAIVED"] },
  invoice: { status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
};

/**
 * Nightly: charge late fees (never lowering one already charged), flag invoices overdue beyond the cancellation
 * threshold for a human to review (seats are never cancelled automatically), and forfeit advance rebates whose
 * pay-by date has passed unpaid.
 */
export async function runLateFees(now = new Date()) {
  const today = istDateOnly(now);
  const rule = await db.lateFeeRule.findFirst({ where: { active: true } });
  const touched = new Set<string>();
  let charged = 0;
  let flagged = 0;
  if (rule) {
    const overdue = await db.instalment.findMany({
      where: { ...UNPAID, dueDate: { lt: today } },
      include: { invoice: { select: { id: true, cancellationFlag: true } } },
    });
    for (const inst of overdue) {
      const state = toInstalmentState(inst);
      const fee = nextLateFee(state, rule, today);
      if (fee !== inst.lateFeePaise) {
        await db.instalment.update({ where: { id: inst.id }, data: { lateFeePaise: fee } });
        touched.add(inst.invoiceId);
        charged++;
      }
      if (!inst.invoice.cancellationFlag && computeLateFee(state, rule, today).flagCancellation) {
        await db.invoice.update({ where: { id: inst.invoiceId }, data: { cancellationFlag: true } });
        inst.invoice.cancellationFlag = true;
        await audit({
          actor: null,
          action: "invoice.flag_cancellation",
          entity: "Invoice",
          entityId: inst.invoiceId,
          reason: `Overdue more than ${rule.cancelFlagAfterDays} days`,
        });
        touched.add(inst.invoiceId);
        flagged++;
      }
    }
  }

  // Advance rebate forfeiture: a single-payment invoice that took the rebate but wasn't paid in full by the date
  let forfeited = 0;
  const rebated = await db.invoice.findMany({
    where: { rebatePaise: { gt: 0 }, status: { notIn: ["PAID", "VOID", "WAIVED", "DRAFT"] } },
    include: { instalments: { orderBy: { seq: "asc" } }, year: { include: { rebates: true } } },
  });
  for (const inv of rebated) {
    const rebate = inv.year.rebates.find((r) => r.active) ?? inv.year.rebates[0];
    if (!rebate || rebate.payByDate >= today || inv.instalments.length !== 1) continue;
    const only = inv.instalments[0]!;
    await db.$transaction(async (tx) => {
      await tx.instalment.update({
        where: { id: only.id },
        data: { amountPaise: only.amountPaise + inv.rebatePaise },
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: inv.id, kind: "REBATE" } });
      const breakdown = (inv.breakdown ?? {}) as Record<string, unknown>;
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          totalPaise: inv.totalPaise + inv.rebatePaise,
          rebatePaise: 0,
          breakdown: {
            ...breakdown,
            rebateForfeited: {
              amountPaise: inv.rebatePaise,
              on: today.toISOString(),
              payBy: rebate.payByDate.toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      await refreshInvoice(tx, inv.id, now);
      await audit(
        {
          actor: null,
          action: "invoice.rebate_forfeit",
          entity: "Invoice",
          entityId: inv.id,
          before: { totalPaise: inv.totalPaise, rebatePaise: inv.rebatePaise },
          after: { totalPaise: inv.totalPaise + inv.rebatePaise, rebatePaise: 0 },
          reason: `Not paid in full by ${formatDate(rebate.payByDate)}`,
        },
        tx,
      );
    });
    forfeited++;
  }

  for (const id of touched) await db.$transaction((tx) => refreshInvoice(tx, id, now));
  return { charged, flagged, forfeited, invoicesRefreshed: touched.size };
}

/**
 * Daily: tour reminders (tomorrow's visits), "due soon" notices 7 days and 1 day before an instalment, and a weekly
 * overdue reminder per instalment. `lastReminderAt` makes each notice go once.
 */
export async function runReminders(now = new Date()) {
  const tours = await sendTourReminders(now);
  const today = istDateOnly(now);
  const startOfToday = new Date(today.getTime() - 5.5 * 3600_000); // midnight IST as an instant
  let dueSoon = 0;
  let overdue = 0;
  const soon = await db.instalment.findMany({
    where: {
      ...UNPAID,
      dueDate: { in: [istDateOnly(now, 1), istDateOnly(now, 7)] },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: startOfToday } }],
    },
    include: { invoice: { include: { student: true } } },
  });
  for (const i of soon) {
    const amount = i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise;
    if (amount <= 0) continue;
    if (
      await notifyFamily(i.invoice.studentId, "fee-due-reminder", i.id, {
        amount: formatINR(amount),
        studentName: `${i.invoice.student.firstName} ${i.invoice.student.lastName}`,
        label: i.label,
        dueDate: formatDate(i.dueDate, "d MMMM yyyy"),
      })
    )
      dueSoon++;
    await db.instalment.update({ where: { id: i.id }, data: { lastReminderAt: now } });
  }
  const late = await db.instalment.findMany({
    where: {
      ...UNPAID,
      dueDate: { lt: today },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }],
    },
    include: { invoice: { include: { student: true } } },
  });
  for (const i of late) {
    const amount = i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise;
    if (amount <= 0) continue;
    if (
      await notifyFamily(i.invoice.studentId, "overdue-reminder", i.id, {
        amount: formatINR(amount),
        studentName: `${i.invoice.student.firstName} ${i.invoice.student.lastName}`,
        label: i.label,
        dueDate: formatDate(i.dueDate),
      })
    )
      overdue++;
    await db.instalment.update({ where: { id: i.id }, data: { lastReminderAt: now } });
  }
  return { tours, dueSoon, overdue };
}

async function notifyFamily(
  studentId: string,
  template: "fee-due-reminder" | "overdue-reminder",
  instalmentId: string,
  data: Record<string, string>,
) {
  const g = (await guardiansFor(db, studentId))[0];
  if (!g) return false;
  await sendTemplate({
    template,
    to: {
      email: g.email,
      phone: g.phone,
      consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
    },
    data: { parentName: g.name, ...data },
    related: { type: "instalment", id: instalmentId },
  });
  return true;
}

export async function runOutboxRetry() {
  return retryDueOutbox();
}

export const JOBS = {
  "late-fees": runLateFees,
  reminders: runReminders,
  "outbox-retry": runOutboxRetry,
} as const;
export type JobName = keyof typeof JOBS;
