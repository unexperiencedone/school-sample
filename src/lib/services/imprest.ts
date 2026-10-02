import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { formatINR } from "@/lib/money";
import { istDateOnly } from "@/lib/dates";

/**
 * Pocket money (imprest) for boarders: a simple ledger of credits (term allowance, top-ups) and expenses (tuck
 * shop, outings, pharmacy…). The balance is always derived from the entries — never stored — so it can't drift.
 */

export const IMPREST_CATEGORIES = {
  TOP_UP: "Top-up",
  TUCK_SHOP: "Tuck shop",
  OUTING: "Outing",
  STATIONERY: "Stationery",
  MEDICAL: "Pharmacy",
  LAUNDRY: "Laundry",
  TRAVEL: "Travel",
  OTHER: "Other",
} as const;
export type ImprestCategory = keyof typeof IMPREST_CATEGORIES;
export const LOW_BALANCE_PAISE = 200_000; // ₹2,000

export async function balances(studentIds?: string[]) {
  const sums = await db.imprestEntry.groupBy({
    by: ["studentId", "kind"],
    where: studentIds ? { studentId: { in: studentIds } } : undefined,
    _sum: { amountPaise: true },
    _max: { createdAt: true },
  });
  const map = new Map<string, { balance: number; last: Date | null }>();
  for (const s of sums) {
    const row = map.get(s.studentId) ?? { balance: 0, last: null };
    row.balance += (s.kind === "CREDIT" ? 1 : -1) * (s._sum.amountPaise ?? 0);
    if (s._max.createdAt && (!row.last || s._max.createdAt > row.last)) row.last = s._max.createdAt;
    map.set(s.studentId, row);
  }
  return map;
}

export async function ledger(studentId: string) {
  const entries = await db.imprestEntry.findMany({
    where: { studentId },
    include: { term: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let running = 0;
  return entries.map((e) => {
    running += (e.kind === "CREDIT" ? 1 : -1) * e.amountPaise;
    return { ...e, balance: running };
  });
}

export async function addEntry(
  actor: { id: string; role: Role },
  input: {
    studentId: string;
    kind: "CREDIT" | "EXPENSE";
    category: ImprestCategory;
    amountPaise: number;
    description: string;
    at?: Date;
  },
) {
  assertCan(actor.role, "imprest:write");
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0)
    throw new ApiError(422, "VALIDATION", "Enter an amount above zero.");
  if (input.amountPaise > 5_000_000)
    throw new ApiError(422, "VALIDATION", "That is more than ₹50,000 — record it as a fee instead.");
  const student = await db.student.findUniqueOrThrow({ where: { id: input.studentId } });
  if (student.boardingType === "DAY")
    throw new ApiError(409, "DAY_PUPIL", "Pocket money is kept for boarders only.");
  const at = input.at ?? new Date();
  const day = istDateOnly(at);
  const term = await db.term.findFirst({ where: { startDate: { lte: day }, endDate: { gte: day } } });
  // The balance check and the insert share one transaction behind a per-pupil lock, so two simultaneous
  // purchases can't both pass the check and overspend.
  const entry = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"imprest:" + input.studentId}))`;
    if (input.kind === "EXPENSE") {
      const rows = await tx.imprestEntry.groupBy({
        by: ["kind"],
        where: { studentId: input.studentId },
        _sum: { amountPaise: true },
      });
      const sum = (k: string) => rows.find((r) => r.kind === k)?._sum.amountPaise ?? 0;
      const balance = sum("CREDIT") - sum("EXPENSE");
      if (input.amountPaise > balance)
        throw new ApiError(
          409,
          "INSUFFICIENT",
          `Only ${formatINR(balance)} is left — ask the family to top up first.`,
        );
    }
    return tx.imprestEntry.create({
      data: {
        ...input,
        description: input.description.trim(),
        termId: term?.id,
        createdById: actor.id,
        createdAt: at,
      },
    });
  });
  await audit({
    actor,
    action: `imprest.${input.kind.toLowerCase()}`,
    entity: "ImprestEntry",
    entityId: entry.id,
    after: { studentId: input.studentId, amountPaise: input.amountPaise, category: input.category },
  });
  return entry;
}
