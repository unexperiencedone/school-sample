import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { daysBetween, formatDate, istDateOnly } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { sendTemplate } from "@/lib/notify";
import { guardiansFor } from "./invoices";

export type DuesFilter = "overdue" | "upcoming" | "flagged";

export type DueRow = {
  instalmentId: string;
  invoiceId: string;
  invoiceNumber: string;
  label: string;
  dueDate: Date;
  daysOverdue: number;
  principalPaise: number;
  lateFeePaise: number;
  outstandingPaise: number;
  lastReminderAt: Date | null;
  flagged: boolean;
  student: { id: string; name: string; className: string; classOrder: number; admissionNo: string };
};

/** Unpaid instalments for the dues screen and its CSV export. Outstanding = principal + unwaived late fee − paid. */
export async function listDues(
  filter: DuesFilter,
  opts: { classId?: string; q?: string } = {},
  now = new Date(),
): Promise<DueRow[]> {
  const today = istDateOnly(now);
  const where: Prisma.InstalmentWhereInput = {
    status: { notIn: ["PAID", "WAIVED"] },
    invoice: {
      status: { notIn: ["VOID", "WAIVED", "DRAFT"] },
      ...(filter === "flagged" ? { cancellationFlag: true } : {}),
      ...(opts.classId ? { student: { classId: opts.classId } } : {}),
      ...(opts.q
        ? {
            OR: [
              { number: { contains: opts.q, mode: "insensitive" } },
              { student: { firstName: { contains: opts.q, mode: "insensitive" } } },
              { student: { lastName: { contains: opts.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    ...(filter === "upcoming"
      ? { dueDate: { gte: today, lt: istDateOnly(now, 31) } }
      : { dueDate: { lt: today } }),
  };
  const rows = await db.instalment.findMany({
    where,
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          cancellationFlag: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              class: { select: { name: true, order: true } },
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  return rows
    .map((i) => {
      const late = i.lateFeeWaived ? 0 : i.lateFeePaise;
      return {
        instalmentId: i.id,
        invoiceId: i.invoiceId,
        invoiceNumber: i.invoice.number,
        label: i.label,
        dueDate: i.dueDate,
        daysOverdue: Math.max(0, daysBetween(i.dueDate, today)),
        principalPaise: Math.max(0, i.amountPaise - i.paidPaise),
        lateFeePaise: late,
        outstandingPaise: i.amountPaise + late - i.paidPaise,
        lastReminderAt: i.lastReminderAt,
        flagged: i.invoice.cancellationFlag,
        student: {
          id: i.invoice.student.id,
          name: `${i.invoice.student.firstName} ${i.invoice.student.lastName}`,
          className: i.invoice.student.class.name,
          classOrder: i.invoice.student.class.order,
          admissionNo: i.invoice.student.admissionNo,
        },
      };
    })
    .filter((r) => r.outstandingPaise > 0);
}

/** Sends one family a due/overdue reminder now (outside the weekly run) and records it. */
export async function remindNow(actor: { id: string; role: Role }, instalmentId: string, now = new Date()) {
  assertCan(actor.role, "comms:send");
  assertCan(actor.role, "fees:read");
  const i = await db.instalment.findUniqueOrThrow({
    where: { id: instalmentId },
    include: { invoice: { include: { student: true } } },
  });
  const g = (await guardiansFor(db, i.invoice.studentId))[0];
  if (!g) throw new Error("No guardian on record for this pupil");
  const amount = i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise;
  const overdue = i.dueDate < istDateOnly(now);
  await sendTemplate({
    template: overdue ? "overdue-reminder" : "fee-due-reminder",
    to: {
      email: g.email,
      phone: g.phone,
      consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
    },
    data: {
      parentName: g.name,
      amount: formatINR(amount),
      studentName: `${i.invoice.student.firstName} ${i.invoice.student.lastName}`,
      label: i.label,
      dueDate: formatDate(i.dueDate, overdue ? "d MMM yyyy" : "d MMMM yyyy"),
    },
    related: { type: "instalment", id: i.id },
  });
  await db.instalment.update({ where: { id: i.id }, data: { lastReminderAt: now } });
  await audit({ actor, action: "fee.remind", entity: "Instalment", entityId: i.id, after: { to: g.email } });
  return g.name;
}
