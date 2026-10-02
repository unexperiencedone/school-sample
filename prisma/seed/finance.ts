import type { AcademicYear, PaymentMethod, PrismaClient } from "@prisma/client";
import { createInvoice } from "../../src/lib/services/invoices";
import { recordPayment, refreshInvoice } from "../../src/lib/services/ledger";
import { nextLateFee, outstanding } from "../../src/lib/fee-engine";
import type { Rng } from "./rng";
import type { SeededStudent } from "./people";
import { utc } from "./core";

type Years = { prev: AcademicYear; curr: AcademicYear; next: AcademicYear };
type Planned = {
  at: Date;
  studentId: string;
  invoiceId: string;
  instalmentId?: string;
  amountPaise: number;
  method: PaymentMethod;
  reference?: string;
};

export const SEED_TODAY = utc(2026, 10, 1);

const ONLINE: PaymentMethod[] = ["UPI", "UPI", "UPI", "CARD", "NETBANKING", "NETBANKING"];
const day = 86400_000;

/** Approved scholarships/bursaries (applied by the engine) plus a few pending requests for the approval demo. */
async function seedConcessionGrants(
  db: PrismaClient,
  rng: Rng,
  students: SeededStudent[],
  yearId: string,
  approverId: string,
) {
  const byCode = Object.fromEntries((await db.concession.findMany()).map((c) => [c.code, c.id]));
  const upper = students.filter((s) => s.classOrder >= 9);
  const any = students.filter((s) => s.classOrder >= 4);
  const picked = new Set<string>();
  const grant = async (
    s: SeededStudent,
    code: string,
    status: "APPROVED" | "REQUESTED",
    reason: string,
    overrideBp?: number,
  ) => {
    if (picked.has(s.id)) return;
    picked.add(s.id);
    await db.studentConcession.create({
      data: {
        studentId: s.id,
        concessionId: byCode[code]!,
        yearId,
        status,
        reason,
        overrideBp,
        decidedById: status === "APPROVED" ? approverId : null,
        decidedAt: status === "APPROVED" ? utc(2026, 2, 20) : null,
      },
    });
  };
  for (const s of rng.shuffle(upper).slice(0, 4))
    await grant(
      s,
      "SCH-ACAD",
      "APPROVED",
      "Scholarship examination, top decile",
      rng.pick([5000, 4000, 3000]),
    );
  for (const s of rng.shuffle(any).slice(0, 6))
    await grant(s, "SCH-SPEC", "APPROVED", rng.pick(["Music audition", "Sport trial", "Art portfolio"]));
  for (const s of rng.shuffle(any).slice(0, 2))
    await grant(s, "BURSARY", "APPROVED", "Means assessment 2026");
  return { pendingCandidates: rng.shuffle(any.filter((s) => !picked.has(s.id))).slice(0, 3), byCode };
}

/**
 * Invoices for every active student (current year) and continuing students (previous year), then a chronological
 * payment history with realistic behaviour: on time, partial, overdue (with late fees), paid ahead, waived.
 */
export async function seedFinance(
  db: PrismaClient,
  rng: Rng,
  years: Years,
  students: SeededStudent[],
  users: Record<string, string>,
) {
  const { pendingCandidates, byCode } = await seedConcessionGrants(
    db,
    rng,
    students,
    years.curr.id,
    users.PRINCIPAL!,
  );
  const planned: Planned[] = [];
  const invoiceProfiles: { invoiceId: string; profile: string; plan: string }[] = [];

  // ── Previous year: fully paid history for continuing pupils ──
  for (const s of students.filter((x) => !x.isNew && x.classOrder > 0)) {
    const plan = rng.pick(["ONE", "THREE", "THREE", "TWO"]);
    const { invoice } = await db.$transaction((tx) =>
      createInvoice(tx, { studentId: s.id, yearId: years.prev.id, planCode: plan, asOf: utc(2025, 3, 1) }),
    );
    for (const inst of invoice.instalments) {
      planned.push({
        at: new Date(inst.dueDate.getTime() + rng.int(-6, 4) * day + rng.int(9, 18) * 3600_000),
        studentId: s.id,
        invoiceId: invoice.id,
        instalmentId: inst.id,
        amountPaise: inst.amountPaise,
        method: rng.chance(0.75)
          ? rng.pick(ONLINE)
          : rng.pick(["BANK_TRANSFER", "BANK_TRANSFER", "DEMAND_DRAFT"] as PaymentMethod[]),
      });
    }
  }

  // ── Current year ──
  for (const s of students) {
    let profile = rng.pick([
      "ontime",
      "ontime",
      "ontime",
      "ontime",
      "ontime",
      "ontime",
      "ontime",
      "partial",
      "overdue",
      "overdue",
      "late-start",
      "ahead",
    ]);
    const picked = profile === "ahead" ? "TWO" : rng.pick(["ONE", "TWO", "THREE", "THREE"]);
    // The demo parent: Ira on the annual plan, paid; Anvi on termly instalments with the next one due in days
    const plan = s.demo === "IRA" ? "ONE" : s.demo === "ANVI" ? "TWO" : picked;
    if (s.demo) profile = "ontime";
    const { invoice } = await db.$transaction((tx) =>
      createInvoice(tx, { studentId: s.id, yearId: years.curr.id, planCode: plan, asOf: utc(2026, 3, 1) }),
    );
    invoiceProfiles.push({ invoiceId: invoice.id, profile, plan });
    const method = () =>
      rng.chance(0.72)
        ? rng.pick(ONLINE)
        : rng.pick(["BANK_TRANSFER", "BANK_TRANSFER", "DEMAND_DRAFT", "CHEQUE"] as PaymentMethod[]);
    for (const inst of invoice.instalments) {
      const due = inst.dueDate.getTime() <= SEED_TODAY.getTime();
      const payAt = new Date(
        Math.min(
          inst.dueDate.getTime() + rng.int(-8, 3) * day + rng.int(9, 19) * 3600_000,
          SEED_TODAY.getTime() - day,
        ),
      );
      if (
        profile === "ahead" ||
        (due &&
          (profile === "ontime" ||
            (profile === "partial" && inst.seq === 1) ||
            (profile === "overdue" && inst.seq === 1)))
      ) {
        if (!due && profile !== "ahead") continue;
        planned.push({
          at: profile === "ahead" ? new Date(utc(2026, 4, 8).getTime() + rng.int(0, 60) * day) : payAt,
          studentId: s.id,
          invoiceId: invoice.id,
          instalmentId: inst.id,
          amountPaise: inst.amountPaise,
          method: method(),
        });
      } else if (due && profile === "partial") {
        planned.push({
          at: payAt,
          studentId: s.id,
          invoiceId: invoice.id,
          instalmentId: inst.id,
          amountPaise: Math.round((inst.amountPaise * rng.pick([0.4, 0.5, 0.6])) / 100) * 100,
          method: method(),
        });
      }
      // "late-start" pays nothing yet: long-overdue first instalment (cancellation flag demo)
    }
  }

  // Two overpayments on fully-paid annual invoices → wallet credits
  for (const ip of rng
    .shuffle(invoiceProfiles.filter((p) => p.profile === "ontime" && p.plan === "ONE"))
    .slice(0, 2)) {
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: ip.invoiceId } });
    planned.push({
      at: utc(2026, 9, rng.int(12, 20)),
      studentId: inv.studentId,
      invoiceId: inv.id,
      amountPaise: 500_000,
      method: "BANK_TRANSFER",
      reference: `NEFT-OVERPAY-${inv.number.slice(-5)}`,
    });
  }

  planned.sort((a, b) => a.at.getTime() - b.at.getTime());
  let n = 0;
  for (const p of planned) {
    n++;
    const manual = ["BANK_TRANSFER", "DEMAND_DRAFT", "CHEQUE", "CASH"].includes(p.method);
    await db.$transaction(
      (tx) =>
        recordPayment(tx, {
          provider: manual ? "manual" : "mock",
          providerPaymentId: manual ? `manual_seed_${n}` : `mock_pay_seed_${n}`,
          method: p.method,
          amountPaise: p.amountPaise,
          receivedAt: p.at,
          studentId: p.studentId,
          reference: manual
            ? (p.reference ??
              `${p.method === "DEMAND_DRAFT" ? "DD" : p.method === "CHEQUE" ? "CHQ" : "NEFT"}${String(400000 + n * 37).slice(-6)}`)
            : null,
          recordedById: manual ? users.ACCOUNTS : null,
          allocate: { invoiceId: p.invoiceId, instalmentId: p.instalmentId },
        }),
      { timeout: 30_000 },
    );
  }

  // Late fees as the nightly job would compute them today, plus advisory cancellation flags
  const rule = await db.lateFeeRule.findFirstOrThrow({ where: { active: true } });
  const open = await db.instalment.findMany({
    where: { dueDate: { lt: SEED_TODAY }, invoice: { yearId: years.curr.id } },
  });
  for (const i of open) {
    if (outstanding(i) === 0) continue;
    const fee = nextLateFee(i, rule, SEED_TODAY);
    if (fee > 0) await db.instalment.update({ where: { id: i.id }, data: { lateFeePaise: fee } });
  }
  for (const inv of await db.invoice.findMany({
    where: { yearId: { in: [years.curr.id, years.prev.id] } },
    select: { id: true },
  })) {
    await db.$transaction((tx) => refreshInvoice(tx, inv.id, SEED_TODAY));
  }
  const late = await db.invoice.findMany({
    where: { yearId: years.curr.id, status: "OVERDUE" },
    include: { instalments: true },
  });
  for (const inv of late) {
    if (inv.instalments.some((i) => i.seq === 1 && i.paidPaise === 0))
      await db.invoice.update({ where: { id: inv.id }, data: { cancellationFlag: true } });
  }

  // One waived late fee and one fully waived invoice (staff hardship case), both with reasons
  const waiveTarget = await db.instalment.findFirst({
    where: { lateFeePaise: { gt: 0 } },
    orderBy: { id: "asc" },
  });
  if (waiveTarget)
    await db.instalment.update({
      where: { id: waiveTarget.id },
      data: { lateFeeWaived: true, waiveReason: "Bank delay evidenced by family (sample)" },
    });
  const waiveInv = await db.invoice.findFirst({
    where: { yearId: years.curr.id, status: "OVERDUE" },
    orderBy: { number: "desc" },
  });
  if (waiveInv) await db.invoice.update({ where: { id: waiveInv.id }, data: { status: "WAIVED" } });

  // Pending concession requests (for the Principal's approval queue)
  const PENDING_REASONS = [
    "Change in family circumstances after a parent's job loss (sample request)",
    "Single-parent household; income documents verified by Accounts (sample request)",
    "Medical expenses in the family this year; supporting letter on file (sample request)",
  ];
  for (const [k, s] of pendingCandidates.entries()) {
    const at = new Date(SEED_TODAY.getTime() - (k * 3 + 2) * day + 11 * 3600_000);
    const reason = PENDING_REASONS[k % PENDING_REASONS.length]!;
    const sc = await db.studentConcession.create({
      data: {
        studentId: s.id,
        concessionId: byCode["BURSARY"]!,
        yearId: years.curr.id,
        status: "REQUESTED",
        reason,
        createdAt: at,
      },
    });
    // The request trail Accounts would leave, so the Principal's queue shows who asked (maker–checker)
    await db.auditLog.create({
      data: {
        actorId: users.ACCOUNTS,
        actorRole: "ACCOUNTS",
        action: "concession.request",
        entity: "StudentConcession",
        entityId: sc.id,
        reason,
        createdAt: at,
      },
    });
  }

  return { payments: planned.length };
}

/** Refunds in each state, a withdrawn pupil, and the imprest ledger for boarders. */
export async function seedRefundsAndImprest(
  db: PrismaClient,
  rng: Rng,
  years: Years,
  students: SeededStudent[],
  users: Record<string, string>,
) {
  const paid = await db.payment.findMany({
    where: { studentId: { not: null }, receivedAt: { gte: utc(2026, 4, 1) }, amountPaise: { gt: 1_000_000 } },
    orderBy: { receivedAt: "asc" },
    take: 40,
  });
  const [a, b, c] = [paid[5], paid[17], paid[29]];
  if (a) {
    await db.refund.create({
      data: {
        paymentId: a.id,
        amountPaise: 1_500_000,
        reason: "Pupil withdrew before the session started (sample)",
        status: "PROCESSED",
        idempotencyKey: `seed-refund-${a.id}`,
        providerRefundId: "mock_rfnd_seed_1",
        requestedById: users.ACCOUNTS,
        approvedById: users.PRINCIPAL,
        createdAt: utc(2026, 5, 28),
        decidedAt: utc(2026, 6, 2),
        processedAt: utc(2026, 6, 3),
        policy: { pupil: "NEW", rule: "beforeStartBp 100%" },
      },
    });
    await db.payment.update({
      where: { id: a.id },
      data: { refundedPaise: 1_500_000, status: "PARTIALLY_REFUNDED" },
    });
  }
  if (b)
    await db.refund.create({
      data: {
        paymentId: b.id,
        amountPaise: 800_000,
        reason: "Duplicate transport charge (sample)",
        status: "APPROVED",
        idempotencyKey: `seed-refund-${b.id}`,
        requestedById: users.ACCOUNTS,
        approvedById: users.PRINCIPAL,
        createdAt: utc(2026, 9, 23),
        decidedAt: utc(2026, 9, 25),
      },
    });
  if (c)
    await db.refund.create({
      data: {
        paymentId: c.id,
        amountPaise: 1_200_000,
        reason: "Activity trip cancelled (sample)",
        status: "REQUESTED",
        createdAt: utc(2026, 9, 28),
        idempotencyKey: `seed-refund-${c.id}`,
        requestedById: users.ACCOUNTS,
      },
    });

  // Imprest: term top-ups for boarders and everyday spending
  const terms = await db.term.findMany({ where: { yearId: years.curr.id }, orderBy: { startDate: "asc" } });
  const policies = await db.imprestPolicy.findMany({ where: { yearId: years.curr.id } });
  const cats = [
    ["TUCK_SHOP", "Tuck shop", 150, 600],
    ["OUTING", "Weekend outing", 400, 1500],
    ["STATIONERY", "Stationery", 120, 800],
    ["LAUNDRY", "Dry cleaning", 200, 500],
    ["MEDICAL", "Pharmacy", 100, 700],
    ["TRAVEL", "Station drop", 300, 900],
  ] as const;
  const rows = [];
  for (const s of students.filter((x) => x.boardingType !== "DAY")) {
    const policy = policies.find((p) => p.boardingType === s.boardingType);
    for (const term of terms.filter((t) => t.startDate <= SEED_TODAY)) {
      rows.push({
        studentId: s.id,
        termId: term.id,
        kind: "CREDIT",
        category: "TOP_UP",
        amountPaise: policy?.amountPerTermPaise ?? 1_000_000,
        description: `Term deposit — ${term.name}`,
        createdAt: new Date(term.startDate.getTime() + 2 * day),
        createdById: users.ACCOUNTS,
      });
      for (let i = 0; i < rng.int(3, 8); i++) {
        const [cat, label, lo, hi] = rng.pick(cats);
        const at = new Date(
          Math.min(term.startDate.getTime() + rng.int(5, 80) * day, SEED_TODAY.getTime() - day),
        );
        rows.push({
          studentId: s.id,
          termId: term.id,
          kind: "EXPENSE",
          category: cat,
          amountPaise: rng.int(lo, hi) * 100,
          description: label,
          createdAt: at,
          createdById: users.HOUSEPARENT,
        });
      }
    }
  }
  await db.imprestEntry.createMany({ data: rows });

  // One pupil withdrew at the end of the summer (keeps history, frees her seat)
  const leaver = students.find((s) => s.classOrder === 10 && !s.isNew);
  if (leaver)
    await db.student.update({
      where: { id: leaver.id },
      data: { status: "WITHDRAWN", leftOn: utc(2026, 8, 30) },
    });
  return { imprest: rows.length };
}
