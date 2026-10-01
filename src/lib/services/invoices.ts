import "server-only";
import type { Payment, PaymentOrder, Prisma, Receipt } from "@prisma/client";
import { type db, type Tx } from "@/lib/db";
import {
  computeInvoice,
  formatInvoiceNumber,
  type InvoiceComputation,
  type StudentContext,
} from "@/lib/fee-engine";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { school } from "@/config/school";
import { sendTemplate } from "@/lib/notify";
import { structureInclude, toConcessionDef, toPlanDef, toStructureDef } from "./fee-data";
import type { Effect } from "./payments";

type Client = Tx | typeof db;

/** Everything the fee engine needs to know about a student for a given academic year. */
export async function studentContext(
  client: Client,
  studentId: string,
  yearId: string,
): Promise<StudentContext> {
  const student = await client.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { guardians: true },
  });
  const guardianIds = student.guardians.map((g) => g.guardianId);
  const siblings = guardianIds.length
    ? await client.student.findMany({
        where: {
          status: { in: ["ACTIVE", "PROSPECTIVE"] },
          guardians: { some: { guardianId: { in: guardianIds } } },
        },
        orderBy: [{ dob: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    : [{ id: studentId }];
  const ordinal = Math.max(1, siblings.findIndex((s) => s.id === studentId) + 1);
  const priorInvoices = await client.invoice.count({
    where: { studentId, yearId: { not: yearId }, status: { not: "VOID" } },
  });
  const granted = await client.studentConcession.findMany({
    where: { studentId, yearId, status: "APPROVED" },
    include: { concession: true },
  });
  return {
    siblingOrdinal: ordinal,
    isFoundingFamily: student.isFoundingFamily,
    isStaffWard: student.isStaffWard,
    isNewAdmission: priorInvoices === 0,
    granted: granted.map((g) => ({ code: g.concession.code, overrideBp: g.overrideBp })),
  };
}

export async function pricingInputs(client: Client, studentId: string, yearId: string, planCode: string) {
  const student = await client.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { class: true },
  });
  const [structure, plan, concessions, rebate, context] = await Promise.all([
    client.feeStructure.findFirst({
      where: { yearId, band: student.class.band, boardingType: student.boardingType, status: "ACTIVE" },
      include: structureInclude,
      orderBy: { version: "desc" },
    }),
    client.instalmentPlan.findFirst({ where: { yearId, code: planCode }, include: { parts: true } }),
    client.concession.findMany({ where: { active: true } }),
    client.advanceRebate.findFirst({ where: { yearId, active: true } }),
    studentContext(client, studentId, yearId),
  ]);
  if (!structure)
    throw new Error(`No active fee structure for ${student.class.band} / ${student.boardingType}`);
  if (!plan) throw new Error(`No instalment plan ${planCode} for this year`);
  return { student, structure, plan, concessions, rebate, context };
}

export async function previewInvoice(
  client: Client,
  studentId: string,
  yearId: string,
  planCode: string,
  asOf = new Date(),
): Promise<InvoiceComputation> {
  const p = await pricingInputs(client, studentId, yearId, planCode);
  return computeInvoice({
    structure: toStructureDef(p.structure),
    plan: toPlanDef(p.plan),
    concessions: p.concessions.map(toConcessionDef),
    student: p.context,
    rebate: p.rebate ? { amountPaise: p.rebate.amountPaise, payByDate: p.rebate.payByDate } : null,
    asOf,
  });
}

async function nextInvoiceNumber(tx: Tx, yearName: string): Promise<string> {
  const key = `INV:${yearName}`;
  const row = await tx.receiptSequence.upsert({
    where: { financialYear: key },
    create: { financialYear: key, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return formatInvoiceNumber(school.invoicePrefix, yearName, row.lastSeq);
}

/** Issues an invoice from the active structure version: lines, instalments and a full calculation breakdown. */
export async function createInvoice(
  tx: Tx,
  input: { studentId: string; yearId: string; planCode: string; asOf?: Date },
) {
  const asOf = input.asOf ?? new Date();
  const p = await pricingInputs(tx, input.studentId, input.yearId, input.planCode);
  const c = computeInvoice({
    structure: toStructureDef(p.structure),
    plan: toPlanDef(p.plan),
    concessions: p.concessions.map(toConcessionDef),
    student: p.context,
    rebate: p.rebate ? { amountPaise: p.rebate.amountPaise, payByDate: p.rebate.payByDate } : null,
    asOf,
  });
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: input.yearId } });
  const invoice = await tx.invoice.create({
    data: {
      number: await nextInvoiceNumber(tx, year.name),
      studentId: input.studentId,
      yearId: input.yearId,
      structureId: p.structure.id,
      planId: p.plan.id,
      status: "OPEN",
      subtotalPaise: c.subtotalPaise,
      discountPaise: c.discountPaise,
      rebatePaise: c.rebatePaise,
      totalPaise: c.totalPaise,
      breakdown: {
        steps: c.breakdown,
        applied: c.applied,
        skipped: c.skipped,
        structureVersion: c.structureVersion,
        context: p.context,
      } as unknown as Prisma.InputJsonValue,
      issuedAt: asOf,
      lines: {
        create: c.lines.map((l) => ({
          kind: l.kind,
          feeHeadCode: l.headCode,
          description: l.description,
          amountPaise: l.amountPaise,
          meta: (l.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      },
      instalments: {
        create: c.instalments.map((i) => ({
          seq: i.seq,
          label: i.label,
          dueDate: i.dueDate,
          amountPaise: i.amountPaise,
        })),
      },
    },
    include: { instalments: { orderBy: { seq: "asc" } } },
  });
  return { invoice, computation: c };
}

export async function guardiansFor(client: Client, studentId: string) {
  const links = await client.studentGuardian.findMany({
    where: { studentId },
    include: { guardian: true },
    orderBy: { isPrimary: "desc" },
  });
  return links.map((l) => l.guardian);
}

/** After a fee payment is recorded: receipt email to guardians, and admissions progression for offer acceptances. */
export async function onFeePaymentRecorded(
  tx: Tx,
  order: PaymentOrder,
  payment: Payment,
  receipt: Receipt,
): Promise<Effect[]> {
  const effects: Effect[] = [];
  if (!order.studentId) return effects;
  const student = await tx.student.findUniqueOrThrow({
    where: { id: order.studentId },
    include: { application: true },
  });
  const guardians = await guardiansFor(tx, student.id);
  const customer = order.customer as { email?: string; phone?: string; name?: string };
  const to = guardians[0] ?? null;
  const data = {
    parentName: to?.name ?? customer.name ?? "Parent",
    amount: formatINR(payment.amountPaise),
    receipt: receipt.number,
    studentName: `${student.firstName} ${student.lastName}`,
    method: payment.method,
    date: formatDate(payment.receivedAt),
  };
  effects.push(() =>
    sendTemplate({
      template: "payment-receipt",
      to: {
        email: to?.email ?? customer.email,
        phone: to?.phone ?? customer.phone,
        consent: {
          email: to?.emailOptIn ?? true,
          whatsapp: to?.whatsappOptIn ?? true,
          sms: to?.smsOptIn ?? false,
        },
      },
      data,
      channels: ["EMAIL", "WHATSAPP"],
      related: { type: "payment", id: payment.id },
    }).then(() => undefined),
  );
  if (student.status === "PROSPECTIVE" && student.application && student.application.stage === "OFFER") {
    const { moveStageInTx } = await import("./admissions");
    effects.push(
      ...(await moveStageInTx(
        tx,
        student.application.id,
        "FEE_PAID",
        null,
        `Fee received (${receipt.number})`,
      )),
    );
  }
  return effects;
}
