import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { matchStatement, parseBankCsv } from "@/lib/reconcile";
import { formatDate } from "@/lib/dates";
import { paiseToRupeeString } from "@/lib/money";

type Actor = { id: string; role: Role };
const day = 86_400_000;

/** Payments that should appear on the school's bank statement: offline money paid into the account. */
const BANKED: Prisma.PaymentWhereInput = {
  provider: "manual",
  method: { in: ["BANK_TRANSFER", "CHEQUE", "DEMAND_DRAFT", "CASH"] },
  status: { not: "FAILED" },
};

/** Unmatched banked payments in a window, as candidates for the matcher. */
async function candidates(from: Date, to: Date) {
  return db.payment.findMany({
    where: { ...BANKED, receivedAt: { gte: from, lte: to }, bankLines: { none: { matchStatus: "MATCHED" } } },
    select: { id: true, amountPaise: true, receivedAt: true, reference: true },
  });
}

/** Imports a CSV export, stores every credit line, and auto-matches what it safely can. */
export async function importStatement(actor: Actor, fileName: string, text: string) {
  assertCan(actor.role, "reconciliation:run");
  if (text.length > 2_000_000) throw new ApiError(413, "TOO_LARGE", "Statement files are limited to 2 MB.");
  const parsed = parseBankCsv(text);
  if (!parsed.lines.length)
    throw new ApiError(422, "EMPTY", parsed.errors[0] ?? "No credit lines found in this file.", {
      errors: parsed.errors,
    });
  const dates = parsed.lines.map((l) => l.date.getTime());
  const pool = await candidates(
    new Date(Math.min(...dates) - 10 * day),
    new Date(Math.max(...dates) + 10 * day),
  );
  const matches = matchStatement(parsed.lines, pool);
  const imp = await db.$transaction(async (tx) => {
    const created = await tx.bankStatementImport.create({
      data: {
        fileName: fileName.slice(0, 200),
        uploadedById: actor.id,
        lines: {
          create: parsed.lines.map((l, i) => ({
            date: l.date,
            description: l.description.slice(0, 500),
            reference: l.reference?.slice(0, 100),
            amountPaise: l.amountPaise,
            paymentId: matches[i]!.paymentId,
            matchStatus: matches[i]!.paymentId ? "MATCHED" : "UNMATCHED",
          })),
        },
      },
    });
    await audit(
      {
        actor,
        action: "reconciliation.import",
        entity: "BankStatementImport",
        entityId: created.id,
        after: { fileName, lines: parsed.lines.length, matched: matches.filter((m) => m.paymentId).length },
      },
      tx,
    );
    return created;
  });
  return {
    importId: imp.id,
    lines: parsed.lines.length,
    matched: matches.filter((m) => m.paymentId).length,
    byReference: matches.filter((m) => m.rule === "reference").length,
    skippedDebits: parsed.skippedDebits,
    errors: parsed.errors,
  };
}

export async function matchLine(actor: Actor, lineId: string, paymentId: string) {
  assertCan(actor.role, "reconciliation:run");
  const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: lineId } });
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { bankLines: true },
  });
  if (payment.bankLines.some((l) => l.matchStatus === "MATCHED" && l.id !== lineId))
    throw new ApiError(409, "ALREADY_MATCHED", "That payment is already matched to another bank line.");
  if (payment.amountPaise !== line.amountPaise)
    throw new ApiError(
      422,
      "AMOUNT_MISMATCH",
      "The amounts differ — record the difference as a separate payment instead.",
    );
  await db.bankStatementLine.update({ where: { id: lineId }, data: { paymentId, matchStatus: "MATCHED" } });
  await audit({
    actor,
    action: "reconciliation.match",
    entity: "BankStatementLine",
    entityId: lineId,
    after: { paymentId },
  });
}

export async function setLineStatus(
  actor: Actor,
  lineId: string,
  status: "UNMATCHED" | "IGNORED",
  reason?: string,
) {
  assertCan(actor.role, "reconciliation:run");
  await db.bankStatementLine.update({
    where: { id: lineId },
    data: { matchStatus: status, paymentId: null },
  });
  await audit({
    actor,
    action: `reconciliation.${status.toLowerCase()}`,
    entity: "BankStatementLine",
    entityId: lineId,
    reason,
  });
}

/** Suggestions for a line the matcher left: same amount, nearest date first. */
export async function suggestionsFor(lineId: string) {
  const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: lineId } });
  const pool = await db.payment.findMany({
    where: { ...BANKED, amountPaise: line.amountPaise, bankLines: { none: { matchStatus: "MATCHED" } } },
    include: { receipt: true, student: { select: { firstName: true, lastName: true } } },
    take: 20,
  });
  return pool.sort(
    (a, b) =>
      Math.abs(a.receivedAt.getTime() - line.date.getTime()) -
      Math.abs(b.receivedAt.getTime() - line.date.getTime()),
  );
}

/** Recorded offline payments older than a few days that no statement has confirmed yet. */
export async function awaitingBank(limit = 50) {
  return db.payment.findMany({
    where: {
      ...BANKED,
      receivedAt: { lt: new Date(Date.now() - 3 * day) },
      bankLines: { none: { matchStatus: "MATCHED" } },
    },
    include: { receipt: true, student: { select: { firstName: true, lastName: true } } },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
}

/**
 * A realistic sample statement for the demo: the last month's offline payments as the bank would show them
 * (some references reformatted, one cheque credited two days later), plus a stray credit and some debits.
 */
export async function sampleStatementCsv(): Promise<string> {
  const recent = await db.payment.findMany({
    where: { ...BANKED, method: { in: ["BANK_TRANSFER", "CHEQUE", "DEMAND_DRAFT"] } },
    orderBy: { receivedAt: "desc" },
    take: 14,
    include: {
      student: { include: { guardians: { include: { guardian: true }, where: { isPrimary: true } } } },
    },
  });
  const rows: string[][] = [];
  let balance = 4_250_000_00;
  for (const [i, p] of recent.reverse().entries()) {
    const who = (p.student?.guardians[0]?.guardian.name ?? "SAMPLE PARENT").toUpperCase();
    const credited = new Date(p.receivedAt.getTime() + (p.method === "CHEQUE" ? 2 : 0) * day);
    const ref = p.method === "BANK_TRANSFER" ? (p.reference ?? "") : (p.reference ?? "").replace(/^\D+/, "");
    balance += p.amountPaise;
    rows.push([
      formatDate(credited, "dd/MM/yyyy"),
      p.method === "CHEQUE"
        ? `CHQ DEP ${ref} ${who}`
        : p.method === "DEMAND_DRAFT"
          ? `DD ${ref} ${who}`
          : `NEFT-${who}`,
      i % 4 === 3 ? "" : ref,
      "",
      paiseToRupeeString(p.amountPaise),
      paiseToRupeeString(balance),
    ]);
    if (i === 4) {
      balance -= 4_500_000;
      rows.push([
        formatDate(credited, "dd/MM/yyyy"),
        "ELECTRICITY BOARD AUTOPAY",
        "",
        "45000.00",
        "",
        paiseToRupeeString(balance),
      ]);
    }
  }
  const last = recent.at(-1)?.receivedAt ?? new Date();
  balance += 1_234_500;
  rows.push([
    formatDate(last, "dd/MM/yyyy"),
    "IMPS-UNKNOWN REMITTER-SCHOOL FEE",
    "IMPS629104",
    "",
    "12345.00",
    paiseToRupeeString(balance),
  ]);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    "Account name,Aurelia Hall School (sample),,,,",
    "Account number,XXXXXXXX0000 (placeholder),,,,",
    ",,,,,",
    "Txn Date,Narration,Ref No./Cheque No.,Debit,Credit,Balance",
    ...rows.map((r) => r.map(esc).join(",")),
  ].join("\n");
}
