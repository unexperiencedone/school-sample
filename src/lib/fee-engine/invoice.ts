import { formatINR, percentOf, splitByWeights, sum } from "@/lib/money";
import {
  type BreakdownStep,
  type ComputedInstalment,
  type ComputedLine,
  type ConcessionDef,
  FeeEngineError,
  type InvoiceComputation,
  type InvoiceInput,
  type PlanDef,
  type StudentContext,
} from "./types";

/** Is this concession available to this student? Returns a reason when not. */
export function eligibility(
  c: ConcessionDef,
  s: StudentContext,
): { eligible: boolean; reason?: string; overrideBp?: number | null } {
  const grant = s.granted.find((g) => g.code === c.code);
  if (grant) return { eligible: true, overrideBp: grant.overrideBp };
  if (!c.automatic) return { eligible: false, reason: "not granted" };
  if (c.needsApproval) return { eligible: false, reason: "awaiting approval" };
  switch (c.type) {
    case "SIBLING": {
      const min = c.minSiblingOrdinal ?? 2;
      return s.siblingOrdinal >= min
        ? { eligible: true }
        : { eligible: false, reason: `sibling ordinal ${s.siblingOrdinal} < ${min}` };
    }
    case "FOUNDING_FAMILY":
      return s.isFoundingFamily ? { eligible: true } : { eligible: false, reason: "not a founding family" };
    case "STAFF_WARD":
      return s.isStaffWard ? { eligible: true } : { eligible: false, reason: "not a staff ward" };
    default:
      return { eligible: false, reason: "requires an approved grant" };
  }
}

export function validatePlan(plan: PlanDef): void {
  if (plan.parts.length === 0) throw new FeeEngineError(`Plan ${plan.code} has no instalments`);
  const seqs = plan.parts.map((p) => p.seq);
  if (new Set(seqs).size !== seqs.length)
    throw new FeeEngineError(`Plan ${plan.code} has duplicate sequence numbers`);
  if (plan.splitType === "PERCENT") {
    const total = sum(plan.parts.map((p) => p.percentBp ?? 0));
    if (total !== 10_000)
      throw new FeeEngineError(`Plan ${plan.code} percentages sum to ${total / 100}%, expected 100%`);
  } else if (plan.parts.slice(0, -1).some((p) => p.fixedPaise == null)) {
    throw new FeeEngineError(`Plan ${plan.code}: every FIXED instalment except the last needs an amount`);
  }
}

/**
 * Builds an invoice from a fee structure:
 *  1. charge lines (registration is never invoiced — it is paid at registration; one-time heads only for new admissions)
 *  2. concessions in priority order (lower number first). Percentages apply to the *remaining* amount of each
 *     applicable head, so stacking compounds rather than double-counts. A non-stackable (exclusive) concession is
 *     skipped if anything was already applied, and blocks everything after it.
 *  3. advance rebate when the plan is single-instalment and due on/before the rebate date
 *  4. instalments: one-time heads land in instalment 1; recurring heads are split by the plan (largest remainder).
 * Every rupee is explained in `breakdown`.
 */
export function computeInvoice(input: InvoiceInput): InvoiceComputation {
  const { structure, plan, student, asOf } = input;
  validatePlan(plan);
  const parts = [...plan.parts].sort((a, b) => a.seq - b.seq);

  const lines: ComputedLine[] = [];
  const breakdown: BreakdownStep[] = [];
  const net: Record<string, number> = {};
  const headByCode = new Map(structure.lines.map((l) => [l.head.code, l.head]));
  let running = 0;

  for (const line of structure.lines) {
    const { head } = line;
    if (head.kind === "REGISTRATION") continue;
    if (head.oneTime && !student.isNewAdmission) continue;
    if (line.amountPaise < 0) throw new FeeEngineError(`Negative amount for ${head.code}`);
    if (line.amountPaise === 0) continue;
    net[head.code] = line.amountPaise;
    running += line.amountPaise;
    lines.push({
      kind: "CHARGE",
      headCode: head.code,
      description: head.name,
      amountPaise: line.amountPaise,
    });
    breakdown.push({
      label: head.name,
      detail: head.oneTime ? "one-time" : "annual",
      amountPaise: line.amountPaise,
      runningTotalPaise: running,
    });
  }
  const subtotal = running;

  const applied: { code: string; amountPaise: number; stackable: boolean }[] = [];
  const skipped: { code: string; reason: string }[] = [];
  const ordered = [...input.concessions].sort(
    (a, b) => a.priority - b.priority || a.code.localeCompare(b.code),
  );

  for (const c of ordered) {
    const e = eligibility(c, student);
    if (!e.eligible) {
      skipped.push({ code: c.code, reason: e.reason ?? "not eligible" });
      continue;
    }
    const blocker = applied.find((a) => !a.stackable);
    if (blocker) {
      skipped.push({ code: c.code, reason: `not combinable with ${blocker.code}` });
      continue;
    }
    if (!c.stackable && applied.length > 0) {
      skipped.push({
        code: c.code,
        reason: `exclusive; ${applied.map((a) => a.code).join(", ")} already applied`,
      });
      continue;
    }
    const heads = Object.keys(net).filter(
      (code) => c.appliesTo.includes(headByCode.get(code)!.kind) && net[code]! > 0,
    );
    if (heads.length === 0) {
      skipped.push({ code: c.code, reason: "no applicable fee heads" });
      continue;
    }

    const perHead: Record<string, number> = {};
    if (c.valueType === "PERCENT") {
      const bp = e.overrideBp ?? c.valueBp ?? 0;
      if (bp < 0 || bp > 10_000)
        throw new FeeEngineError(`Concession ${c.code} has invalid percentage ${bp}`);
      for (const code of heads) perHead[code] = Math.min(percentOf(net[code]!, bp), net[code]!);
    } else {
      const base = sum(heads.map((h) => net[h]!));
      const amount = Math.min(c.valuePaise ?? 0, base);
      const shares = splitByWeights(
        amount,
        heads.map((h) => net[h]!),
      );
      heads.forEach((h, i) => (perHead[h] = shares[i]!));
    }
    const total = sum(Object.values(perHead));
    if (total === 0) {
      skipped.push({ code: c.code, reason: "zero value" });
      continue;
    }
    for (const [code, amt] of Object.entries(perHead)) net[code] = net[code]! - amt;
    running -= total;
    applied.push({ code: c.code, amountPaise: total, stackable: c.stackable });
    const valueLabel =
      c.valueType === "PERCENT" ? `${(e.overrideBp ?? c.valueBp ?? 0) / 100}%` : formatINR(c.valuePaise ?? 0);
    lines.push({
      kind: "CONCESSION",
      description: `${c.name} (${valueLabel})`,
      amountPaise: -total,
      meta: { code: c.code, perHead },
    });
    breakdown.push({
      label: c.name,
      detail: `${valueLabel} on ${heads.map((h) => headByCode.get(h)!.name).join(", ")}`,
      amountPaise: -total,
      runningTotalPaise: running,
    });
  }

  const oneTimeNet = sum(
    Object.entries(net)
      .filter(([code]) => headByCode.get(code)!.oneTime)
      .map(([, v]) => v),
  );
  let recurringNet = running - oneTimeNet;

  let rebate = 0;
  if (
    input.rebate &&
    parts.length === 1 &&
    parts[0]!.dueDate <= input.rebate.payByDate &&
    asOf <= input.rebate.payByDate
  ) {
    rebate = Math.min(input.rebate.amountPaise, recurringNet);
    if (rebate > 0) {
      recurringNet -= rebate;
      running -= rebate;
      lines.push({
        kind: "REBATE",
        description: "Advance payment rebate",
        amountPaise: -rebate,
        meta: { payBy: input.rebate.payByDate.toISOString() },
      });
      breakdown.push({
        label: "Advance payment rebate",
        detail: `if paid in full by ${input.rebate.payByDate.toISOString().slice(0, 10)}`,
        amountPaise: -rebate,
        runningTotalPaise: running,
      });
    }
  }

  const instalments = splitInstalments(plan, parts, recurringNet, oneTimeNet);

  return {
    lines,
    subtotalPaise: subtotal,
    discountPaise: sum(applied.map((a) => a.amountPaise)),
    rebatePaise: rebate,
    totalPaise: running,
    netByHead: net,
    instalments,
    breakdown,
    applied: applied.map(({ code, amountPaise }) => ({ code, amountPaise })),
    skipped,
    structureVersion: structure.version,
  };
}

function splitInstalments(
  plan: PlanDef,
  parts: PlanDef["parts"],
  recurringNet: number,
  oneTimeNet: number,
): ComputedInstalment[] {
  let amounts: number[];
  if (plan.splitType === "PERCENT") {
    amounts = splitByWeights(
      recurringNet,
      parts.map((p) => p.percentBp ?? 0),
    );
  } else {
    const fixed = parts.slice(0, -1).map((p) => Math.min(p.fixedPaise ?? 0, recurringNet));
    let remaining = recurringNet;
    amounts = fixed.map((f) => {
      const a = Math.min(f, remaining);
      remaining -= a;
      return a;
    });
    amounts.push(remaining);
  }
  return parts.map((p, i) => ({
    seq: p.seq,
    label: p.label,
    dueDate: p.dueDate,
    amountPaise: amounts[i]! + (i === 0 ? oneTimeNet : 0),
  }));
}
