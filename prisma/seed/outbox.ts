import type { PrismaClient } from "@prisma/client";
import { sendTemplate } from "../../src/lib/notify";
import { leadRef } from "../../src/lib/services/leads";
import { formatDate } from "../../src/lib/dates";
import { formatINR } from "../../src/lib/money";
import { SEED_TODAY } from "./finance";

const minute = 60_000;
const day = 86_400_000;

/**
 * A fortnight of message history in the Outbox, rendered with the real templates and "delivered" by the mock
 * providers exactly as the app would: enquiry acknowledgements, tour confirmations, fee receipts and a batch of
 * overdue reminders, plus one failed WhatsApp message to demonstrate retries. Each message is backdated to the
 * moment it would have gone out.
 */
export async function seedOutbox(db: PrismaClient) {
  const since = new Date(SEED_TODAY.getTime() - 14 * day);
  const stamp = async (ids: string[], at: Date) => {
    await db.outbox.updateMany({ where: { id: { in: ids } }, data: { createdAt: at } });
    await db.outbox.updateMany({ where: { id: { in: ids }, status: "SENT" }, data: { sentAt: at } });
  };

  const leads = await db.lead.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });
  for (const l of leads) {
    const ids = await sendTemplate({
      template: "enquiry-received",
      to: { email: l.email, phone: l.phone },
      data: { parentName: l.parentName, ref: leadRef(l), classApplying: l.classApplying },
      related: { type: "lead", id: l.id },
    });
    await stamp(ids, new Date(l.createdAt.getTime() + minute));
  }

  const bookings = await db.tourBooking.findMany({
    where: { status: "BOOKED", createdAt: { gte: since } },
    include: { lead: true, slot: true },
    orderBy: { createdAt: "asc" },
  });
  for (const b of bookings) {
    const ids = await sendTemplate({
      template: "tour-confirmation",
      to: { email: b.lead.email, phone: b.lead.phone },
      data: {
        parentName: b.lead.parentName,
        date: formatDate(b.slot.startsAt, "EEEE d MMMM"),
        time: formatDate(b.slot.startsAt, "h:mm a"),
        visitors: String(b.visitors),
      },
      related: { type: "tour", id: b.id },
    });
    await stamp(ids, new Date(b.createdAt.getTime() + 2 * minute));
  }

  const payments = await db.payment.findMany({
    where: { studentId: { not: null }, receivedAt: { gte: since }, status: { not: "FAILED" } },
    include: {
      receipt: true,
      student: { include: { guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } } } },
    },
    orderBy: { receivedAt: "desc" },
    take: 12,
  });
  for (const p of payments.reverse()) {
    const g = p.student?.guardians[0]?.guardian;
    if (!g || !p.receipt) continue;
    const ids = await sendTemplate({
      template: "payment-receipt",
      to: {
        email: g.email,
        phone: g.phone,
        consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
      },
      data: {
        parentName: g.name,
        amount: formatINR(p.amountPaise),
        receipt: p.receipt.number,
        studentName: `${p.student!.firstName} ${p.student!.lastName}`,
        method: p.method,
        date: formatDate(p.receivedAt),
      },
      channels: ["EMAIL", "WHATSAPP"],
      related: { type: "payment", id: p.id },
    });
    await stamp(ids, new Date(p.receivedAt.getTime() + minute));
  }

  // The weekly overdue run (Friday morning) for six families
  const runAt = new Date(SEED_TODAY.getTime() - 6 * day + 4 * 3600_000); // 25 Sep, 09:30 IST
  const overdue = await db.instalment.findMany({
    where: { dueDate: { lt: runAt }, status: { in: ["OVERDUE", "PARTIAL"] } },
    include: {
      invoice: {
        include: {
          student: {
            include: { guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } } },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 6,
  });
  for (const i of overdue) {
    const g = i.invoice.student.guardians[0]?.guardian;
    if (!g) continue;
    const ids = await sendTemplate({
      template: "overdue-reminder",
      to: {
        email: g.email,
        phone: g.phone,
        consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
      },
      data: {
        parentName: g.name,
        amount: formatINR(i.amountPaise + i.lateFeePaise - i.paidPaise),
        studentName: `${i.invoice.student.firstName} ${i.invoice.student.lastName}`,
        label: i.label,
        dueDate: formatDate(i.dueDate),
      },
      related: { type: "instalment", id: i.id },
    });
    await stamp(ids, runAt);
  }

  // One WhatsApp that bounced three times — the outbox shows the error and a Retry button
  const bounce = await db.outbox.findFirst({
    where: { channel: "WHATSAPP", template: "enquiry-received" },
    orderBy: { createdAt: "desc" },
  });
  if (bounce)
    await db.outbox.update({
      where: { id: bounce.id },
      data: {
        status: "FAILED",
        attempts: 3,
        sentAt: null,
        nextAttemptAt: null,
        lastError: "Recipient is not a WhatsApp user (sample provider response, error 131026)",
      },
    });
  return db.outbox.count();
}
