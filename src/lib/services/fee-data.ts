import "server-only";
import type {
  BoardingType,
  ClassBand,
  Concession,
  FeeHead,
  FeeStructure,
  FeeStructureLine,
  InstalmentPlan,
  InstalmentPlanPart,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  computeInvoice,
  type ConcessionDef,
  type InvoiceComputation,
  type PlanDef,
  type RefundPolicy,
  type StructureDef,
} from "@/lib/fee-engine";
import { DEFAULT_REFUND_POLICY } from "@/lib/fee-engine/refund";

/** Mapping between Prisma rows and the pure fee-engine types, plus read models for fee pages. */

export const BAND_LABEL: Record<ClassBand, string> = {
  PRE_PREP: "Pre-Prep",
  PREP: "Prep",
  UPPER: "Upper School",
  SIXTH_FORM: "Sixth Form",
};
export const BAND_YEARS: Record<ClassBand, string> = {
  PRE_PREP: "Nursery – Year 2",
  PREP: "Year 3 – Year 6",
  UPPER: "Year 7 – Year 11",
  SIXTH_FORM: "Year 12 – Year 13",
};
export const BOARDING_LABEL: Record<BoardingType, string> = {
  FULL: "Full boarding",
  FLEXI: "Flexi boarding",
  DAY: "Day boarding",
};
export const BANDS: ClassBand[] = ["PRE_PREP", "PREP", "UPPER", "SIXTH_FORM"];

export type StructureWithLines = FeeStructure & { lines: (FeeStructureLine & { feeHead: FeeHead })[] };
export type PlanWithParts = InstalmentPlan & { parts: InstalmentPlanPart[] };

export function toStructureDef(s: StructureWithLines): StructureDef {
  return {
    id: s.id,
    version: s.version,
    lines: [...s.lines]
      .sort((a, b) => a.feeHead.order - b.feeHead.order)
      .map((l) => ({
        head: {
          code: l.feeHead.code,
          name: l.feeHead.name,
          kind: l.feeHead.kind,
          refundable: l.feeHead.refundable,
          oneTime: l.feeHead.oneTime,
          recurring: l.feeHead.recurring,
          taxable: l.feeHead.taxable,
        },
        amountPaise: l.amountPaise,
      })),
  };
}

export function toPlanDef(p: PlanWithParts): PlanDef {
  return {
    code: p.code,
    name: p.name,
    splitType: p.splitType,
    parts: [...p.parts]
      .sort((a, b) => a.seq - b.seq)
      .map((x) => ({
        seq: x.seq,
        label: x.label,
        dueDate: x.dueDate,
        percentBp: x.percentBp,
        fixedPaise: x.fixedPaise,
      })),
  };
}

export function toConcessionDef(c: Concession): ConcessionDef {
  return {
    code: c.code,
    name: c.name,
    type: c.type,
    valueType: c.valueType,
    valueBp: c.valueBp,
    valuePaise: c.valuePaise,
    appliesTo: c.appliesTo,
    stackable: c.stackable,
    priority: c.priority,
    needsApproval: c.needsApproval,
    automatic: c.automatic,
    minSiblingOrdinal: c.minSiblingOrdinal,
  };
}

export const structureInclude = {
  lines: { include: { feeHead: true } },
} satisfies Prisma.FeeStructureInclude;

/** The latest ACTIVE version for each band × boarding type in a year. */
export async function activeStructures(yearId: string): Promise<StructureWithLines[]> {
  const all = await db.feeStructure.findMany({
    where: { yearId, status: "ACTIVE" },
    include: structureInclude,
    orderBy: { version: "desc" },
  });
  const seen = new Set<string>();
  return all.filter((s) => {
    const k = `${s.band}:${s.boardingType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function refundPolicy(): Promise<RefundPolicy> {
  const row = await db.setting.findUnique({ where: { key: "refund_policy" } });
  return (row?.value as RefundPolicy | undefined) ?? DEFAULT_REFUND_POLICY;
}

export type PublicFeeSchedule = {
  year: { id: string; name: string };
  years: { name: string }[];
  boarding: BoardingType[];
  bands: {
    band: ClassBand;
    label: string;
    years: string;
    columns: {
      boarding: BoardingType;
      registrationPaise: number;
      lines: { code: string; name: string; amountPaise: number; oneTime: boolean; refundable: boolean }[];
      annualPaise: number;
      firstYearPaise: number;
      plans: Record<
        string,
        {
          name: string;
          totalPaise: number;
          instalments: { label: string; dueDate: string; amountPaise: number }[];
        }
      >;
    }[];
  }[];
  rebate: { amountPaise: number; payByDate: string } | null;
  imprest: { boarding: BoardingType; amountPerTermPaise: number }[];
  lateFee: { ratePerMonthBp: number; graceDays: number; cancelFlagAfterDays: number | null } | null;
  concessions: {
    code: string;
    name: string;
    description: string | null;
    valueBp: number | null;
    valuePaise: number | null;
    valueType: string;
  }[];
  refundPolicy: RefundPolicy;
  plans: { code: string; name: string }[];
};

/**
 * Builds the public fee schedule for a set of boarding types, computed by the fee engine for a new admission
 * with no concessions — so the website can never drift from what invoices will actually say.
 */
export async function publicFeeSchedule(
  boarding: BoardingType[],
  yearName?: string,
): Promise<PublicFeeSchedule | null> {
  const years = await db.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const current = years.find((y) => y.isCurrent);
  const year =
    years.find((y) => y.name === yearName) ??
    years.find((y) => current && y.startDate > current.startDate) ??
    current;
  if (!year) return null;
  const [structures, plans, rebate, imprest, lateFee, concessions, policy] = await Promise.all([
    activeStructures(year.id),
    db.instalmentPlan.findMany({
      where: { yearId: year.id },
      include: { parts: true },
      orderBy: { code: "asc" },
    }),
    db.advanceRebate.findFirst({ where: { yearId: year.id, active: true } }),
    db.imprestPolicy.findMany({ where: { yearId: year.id } }),
    db.lateFeeRule.findFirst({ where: { active: true } }),
    db.concession.findMany({ where: { active: true }, orderBy: { priority: "asc" } }),
    refundPolicy(),
  ]);
  const planOrder = ["ONE", "TWO", "THREE"];
  const sortedPlans = [...plans].sort((a, b) => planOrder.indexOf(a.code) - planOrder.indexOf(b.code));
  const student = {
    siblingOrdinal: 1,
    isFoundingFamily: false,
    isStaffWard: false,
    isNewAdmission: true,
    granted: [],
  };

  const bands = BANDS.map((band) => {
    const columns = boarding
      .map((b) => structures.find((s) => s.band === band && s.boardingType === b))
      .filter((s): s is StructureWithLines => !!s)
      .map((s) => {
        const def = toStructureDef(s);
        const computed: Record<string, InvoiceComputation> = {};
        for (const p of sortedPlans)
          computed[p.code] = computeInvoice({
            structure: def,
            plan: toPlanDef(p),
            concessions: [],
            student,
            rebate: null,
            asOf: year.startDate,
          });
        const recurring = def.lines.filter((l) => !l.head.oneTime);
        return {
          boarding: s.boardingType,
          registrationPaise: def.lines.find((l) => l.head.kind === "REGISTRATION")?.amountPaise ?? 0,
          lines: def.lines
            .filter((l) => l.head.kind !== "REGISTRATION")
            .map((l) => ({
              code: l.head.code,
              name: l.head.name,
              amountPaise: l.amountPaise,
              oneTime: l.head.oneTime,
              refundable: l.head.refundable,
            })),
          annualPaise: recurring.reduce((a, l) => a + l.amountPaise, 0),
          firstYearPaise: computed.ONE?.totalPaise ?? 0,
          plans: Object.fromEntries(
            sortedPlans.map((p) => [
              p.code,
              {
                name: p.name,
                totalPaise: computed[p.code]!.totalPaise,
                instalments: computed[p.code]!.instalments.map((i) => ({
                  label: i.label,
                  dueDate: i.dueDate.toISOString(),
                  amountPaise: i.amountPaise,
                })),
              },
            ]),
          ),
        };
      });
    return { band, label: BAND_LABEL[band], years: BAND_YEARS[band], columns };
  }).filter((b) => b.columns.length > 0);

  return {
    year: { id: year.id, name: year.name },
    years: years.filter((y) => !current || y.startDate >= current.startDate).map((y) => ({ name: y.name })),
    boarding,
    bands,
    rebate: rebate ? { amountPaise: rebate.amountPaise, payByDate: rebate.payByDate.toISOString() } : null,
    imprest: imprest.map((i) => ({ boarding: i.boardingType, amountPerTermPaise: i.amountPerTermPaise })),
    lateFee: lateFee
      ? {
          ratePerMonthBp: lateFee.ratePerMonthBp,
          graceDays: lateFee.graceDays,
          cancelFlagAfterDays: lateFee.cancelFlagAfterDays,
        }
      : null,
    concessions: concessions.map((c) => ({
      code: c.code,
      name: c.name,
      description: c.description,
      valueBp: c.valueBp,
      valuePaise: c.valuePaise,
      valueType: c.valueType,
    })),
    refundPolicy: policy,
    plans: sortedPlans.map((p) => ({ code: p.code, name: p.name })),
  };
}
