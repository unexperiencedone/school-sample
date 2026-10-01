import type { AcademicYear, BoardingType, ClassBand, FeeHeadKind, PrismaClient } from "@prisma/client";
import { utc } from "./core";

/** Sample fee heads. Flags drive the engine: one-time heads only hit new admissions; non-refundable heads are never refunded. */
export const FEE_HEADS: {
  code: string;
  name: string;
  kind: FeeHeadKind;
  refundable: boolean;
  oneTime: boolean;
  recurring: boolean;
  order: number;
}[] = [
  {
    code: "REG",
    name: "Registration fee",
    kind: "REGISTRATION",
    refundable: false,
    oneTime: true,
    recurring: false,
    order: 0,
  },
  {
    code: "ADM",
    name: "Admission fee",
    kind: "ADMISSION",
    refundable: false,
    oneTime: true,
    recurring: false,
    order: 1,
  },
  {
    code: "TUI",
    name: "Tuition",
    kind: "TUITION",
    refundable: true,
    oneTime: false,
    recurring: true,
    order: 2,
  },
  {
    code: "BRD",
    name: "Boarding & meals",
    kind: "BOARDING",
    refundable: true,
    oneTime: false,
    recurring: true,
    order: 3,
  },
  {
    code: "ACT",
    name: "Activities & trips",
    kind: "ACTIVITY",
    refundable: false,
    oneTime: false,
    recurring: true,
    order: 4,
  },
  {
    code: "BKS",
    name: "Books & learning resources",
    kind: "BOOKS",
    refundable: false,
    oneTime: false,
    recurring: true,
    order: 5,
  },
  {
    code: "EXM",
    name: "Examination board fees",
    kind: "EXAM",
    refundable: false,
    oneTime: false,
    recurring: true,
    order: 6,
  },
  {
    code: "UNI",
    name: "Uniform & kit (first year)",
    kind: "UNIFORM",
    refundable: false,
    oneTime: true,
    recurring: false,
    order: 7,
  },
  {
    code: "TRN",
    name: "Transport (optional)",
    kind: "TRANSPORT",
    refundable: true,
    oneTime: false,
    recurring: true,
    order: 8,
  },
];

const R = (rupees: number) => rupees * 100;

/** 2027-28 sample annual amounts in rupees. Earlier years are derived (≈ 7% lower per year). */
const BASE: Record<
  ClassBand,
  {
    ADM: number;
    TUI: number;
    ACT: number;
    BKS: number;
    EXM?: number;
    UNI: number;
    BRD: Partial<Record<BoardingType, number>>;
  }
> = {
  PRE_PREP: { ADM: 100_000, TUI: 420_000, ACT: 30_000, BKS: 15_000, UNI: 12_000, BRD: { DAY: 0 } },
  PREP: {
    ADM: 125_000,
    TUI: 510_000,
    ACT: 40_000,
    BKS: 20_000,
    UNI: 15_000,
    BRD: { DAY: 0, FLEXI: 240_000, FULL: 450_000 },
  },
  UPPER: {
    ADM: 150_000,
    TUI: 620_000,
    ACT: 50_000,
    BKS: 25_000,
    EXM: 35_000,
    UNI: 18_000,
    BRD: { DAY: 0, FLEXI: 280_000, FULL: 520_000 },
  },
  SIXTH_FORM: {
    ADM: 150_000,
    TUI: 690_000,
    ACT: 50_000,
    BKS: 30_000,
    EXM: 45_000,
    UNI: 18_000,
    BRD: { DAY: 0, FLEXI: 300_000, FULL: 560_000 },
  },
};

const roundTo = (n: number, step = 500) => Math.round(n / step) * step;

export async function seedFees(
  db: PrismaClient,
  years: { prev: AcademicYear; curr: AcademicYear; next: AcademicYear },
  createdById?: string,
) {
  const heads: Record<string, string> = {};
  for (const h of FEE_HEADS) heads[h.code] = (await db.feeHead.create({ data: h })).id;

  const structures: Record<string, string> = {};
  for (const [year, factor] of [
    [years.prev, 0.865],
    [years.curr, 0.93],
    [years.next, 1],
  ] as const) {
    const y0 = year.startDate.getUTCFullYear();
    for (const [band, b] of Object.entries(BASE) as [ClassBand, (typeof BASE)[ClassBand]][]) {
      for (const [boarding, brd] of Object.entries(b.BRD) as [BoardingType, number][]) {
        const amounts: Record<string, number> = {
          REG: 10_000,
          ADM: b.ADM,
          TUI: b.TUI,
          ACT: b.ACT,
          BKS: b.BKS,
          UNI: b.UNI,
        };
        if (b.EXM) amounts.EXM = b.EXM;
        if (brd) amounts.BRD = brd;
        const s = await db.feeStructure.create({
          data: {
            yearId: year.id,
            band,
            boardingType: boarding,
            version: 1,
            status: "ACTIVE",
            effectiveFrom: utc(y0 - 1, 11, 1),
            reason: "Initial fee schedule (sample)",
            createdById,
            lines: {
              create: Object.entries(amounts).map(([code, rupees]) => ({
                feeHeadId: heads[code]!,
                amountPaise: R(code === "REG" ? rupees : roundTo(rupees * factor)),
              })),
            },
          },
        });
        structures[`${year.name}:${band}:${boarding}`] = s.id;
      }
    }

    const plans = [
      {
        code: "ONE",
        name: "Annual (single payment)",
        parts: [{ seq: 1, label: "Annual", dueDate: utc(y0, 4, 10), percentBp: 10_000 }],
      },
      {
        code: "TWO",
        name: "Two instalments (60/40)",
        parts: [
          { seq: 1, label: "First half", dueDate: utc(y0, 4, 10), percentBp: 6_000 },
          { seq: 2, label: "Second half", dueDate: utc(y0, 10, 10), percentBp: 4_000 },
        ],
      },
      {
        code: "THREE",
        name: "Three termly instalments",
        parts: [
          { seq: 1, label: "Monsoon term", dueDate: utc(y0, 4, 10), percentBp: 4_000 },
          { seq: 2, label: "Autumn term", dueDate: utc(y0, 9, 10), percentBp: 3_000 },
          { seq: 3, label: "Spring term", dueDate: utc(y0 + 1, 1, 10), percentBp: 3_000 },
        ],
      },
    ];
    for (const p of plans)
      await db.instalmentPlan.create({
        data: { yearId: year.id, code: p.code, name: p.name, parts: { create: p.parts } },
      });

    await db.advanceRebate.create({
      data: { yearId: year.id, amountPaise: R(25_000), payByDate: utc(y0, 4, 15) },
    });
    for (const [boardingType, amt] of [
      ["FULL", 15_000],
      ["FLEXI", 8_000],
      ["DAY", 3_000],
    ] as const)
      await db.imprestPolicy.create({ data: { yearId: year.id, boardingType, amountPerTermPaise: R(amt) } });
  }

  await db.concession.createMany({
    data: [
      {
        code: "STAFF",
        name: "Staff ward",
        type: "STAFF_WARD",
        valueType: "PERCENT",
        valueBp: 5_000,
        appliesTo: ["TUITION"],
        stackable: false,
        priority: 5,
        automatic: true,
        description: "50% of tuition for daughters of permanent staff. Not combinable.",
      },
      {
        code: "SCH-ACAD",
        name: "Academic scholarship",
        type: "SCHOLARSHIP",
        valueType: "PERCENT",
        valueBp: 5_000,
        appliesTo: ["TUITION"],
        stackable: false,
        priority: 10,
        needsApproval: true,
        description:
          "Up to 50% of tuition after scholarship assessment. Not combinable with other concessions.",
      },
      {
        code: "SCH-SPEC",
        name: "Specialist scholarship",
        type: "SCHOLARSHIP",
        valueType: "PERCENT",
        valueBp: 2_500,
        appliesTo: ["TUITION"],
        stackable: true,
        priority: 15,
        needsApproval: true,
        description: "Up to 25% of tuition for music, sport, art or drama.",
      },
      {
        code: "SIB",
        name: "Sibling concession",
        type: "SIBLING",
        valueType: "PERCENT",
        valueBp: 1_000,
        appliesTo: ["TUITION"],
        stackable: true,
        priority: 20,
        automatic: true,
        minSiblingOrdinal: 2,
        description: "10% of tuition for the second and subsequent daughters enrolled at the same time.",
      },
      {
        code: "FOUND",
        name: "Founding family",
        type: "FOUNDING_FAMILY",
        valueType: "PERCENT",
        valueBp: 500,
        appliesTo: ["TUITION", "BOARDING"],
        stackable: true,
        priority: 30,
        automatic: true,
        description: "5% of tuition and boarding for families who joined in the founding year.",
      },
      {
        code: "BURSARY",
        name: "Means-tested bursary",
        type: "CUSTOM",
        valueType: "FIXED",
        valuePaise: R(100_000),
        appliesTo: ["TUITION", "BOARDING"],
        stackable: true,
        priority: 40,
        needsApproval: true,
        description: "Fixed award set per family after a confidential means assessment.",
      },
    ],
  });
  await db.lateFeeRule.create({
    data: { name: "Standard late fee", ratePerMonthBp: 200, graceDays: 7, cancelFlagAfterDays: 90 },
  });
  await db.setting.upsert({
    where: { key: "refund_policy" },
    create: {
      key: "refund_policy",
      value: {
        newPupil: { beforeStartBp: 10_000, afterStartBp: 0 },
        existingPupil: { noticeDays: 90, inLieuOfNoticeBp: 3_333 },
      },
    },
    update: {},
  });
  return { heads, structures };
}
