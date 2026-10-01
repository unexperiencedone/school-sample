import type { ConcessionDef, FeeHeadDef, PlanDef, StructureDef, StudentContext } from "@/lib/fee-engine";
import { utcDate } from "@/lib/dates";

export const heads: Record<string, FeeHeadDef> = {
  REG: {
    code: "REG",
    name: "Registration",
    kind: "REGISTRATION",
    refundable: false,
    oneTime: true,
    recurring: false,
    taxable: false,
  },
  ADM: {
    code: "ADM",
    name: "Admission",
    kind: "ADMISSION",
    refundable: false,
    oneTime: true,
    recurring: false,
    taxable: false,
  },
  TUI: {
    code: "TUI",
    name: "Tuition",
    kind: "TUITION",
    refundable: true,
    oneTime: false,
    recurring: true,
    taxable: false,
  },
  BRD: {
    code: "BRD",
    name: "Boarding",
    kind: "BOARDING",
    refundable: true,
    oneTime: false,
    recurring: true,
    taxable: false,
  },
  ACT: {
    code: "ACT",
    name: "Activities",
    kind: "ACTIVITY",
    refundable: false,
    oneTime: false,
    recurring: true,
    taxable: false,
  },
};

export const structure: StructureDef = {
  id: "s1",
  version: 1,
  lines: [
    { head: heads.REG!, amountPaise: 1_000_000 },
    { head: heads.ADM!, amountPaise: 15_000_000 },
    { head: heads.TUI!, amountPaise: 60_000_000 },
    { head: heads.BRD!, amountPaise: 40_000_000 },
    { head: heads.ACT!, amountPaise: 5_000_000 },
  ],
};

export const plans: Record<"ONE" | "TWO" | "THREE", PlanDef> = {
  ONE: {
    code: "ONE",
    name: "Single",
    splitType: "PERCENT",
    parts: [{ seq: 1, label: "Annual", dueDate: utcDate(2026, 4, 10), percentBp: 10_000 }],
  },
  TWO: {
    code: "TWO",
    name: "Two",
    splitType: "PERCENT",
    parts: [
      { seq: 1, label: "Term 1", dueDate: utcDate(2026, 4, 10), percentBp: 6_000 },
      { seq: 2, label: "Term 2", dueDate: utcDate(2026, 10, 10), percentBp: 4_000 },
    ],
  },
  THREE: {
    code: "THREE",
    name: "Three",
    splitType: "PERCENT",
    parts: [
      { seq: 1, label: "Autumn", dueDate: utcDate(2026, 4, 10), percentBp: 4_000 },
      { seq: 2, label: "Spring", dueDate: utcDate(2026, 9, 10), percentBp: 3_000 },
      { seq: 3, label: "Summer", dueDate: utcDate(2027, 1, 10), percentBp: 3_000 },
    ],
  },
};

const base = {
  needsApproval: false,
  automatic: false,
  stackable: true,
  minSiblingOrdinal: null,
  valuePaise: null,
  valueBp: null,
};

export const concessions: Record<string, ConcessionDef> = {
  SIB: {
    ...base,
    code: "SIB",
    name: "Sibling",
    type: "SIBLING",
    valueType: "PERCENT",
    valueBp: 1_000,
    appliesTo: ["TUITION"],
    priority: 20,
    automatic: true,
    minSiblingOrdinal: 2,
  },
  FOUND: {
    ...base,
    code: "FOUND",
    name: "Founding family",
    type: "FOUNDING_FAMILY",
    valueType: "PERCENT",
    valueBp: 500,
    appliesTo: ["TUITION", "BOARDING"],
    priority: 30,
    automatic: true,
  },
  SCH50: {
    ...base,
    code: "SCH50",
    name: "Academic scholarship",
    type: "SCHOLARSHIP",
    valueType: "PERCENT",
    valueBp: 5_000,
    appliesTo: ["TUITION"],
    priority: 10,
    stackable: false,
    needsApproval: true,
  },
  STAFF: {
    ...base,
    code: "STAFF",
    name: "Staff ward",
    type: "STAFF_WARD",
    valueType: "PERCENT",
    valueBp: 5_000,
    appliesTo: ["TUITION", "BOARDING"],
    priority: 5,
    automatic: true,
    stackable: false,
  },
  BURSARY: {
    ...base,
    code: "BURSARY",
    name: "Bursary",
    type: "CUSTOM",
    valueType: "FIXED",
    valuePaise: 10_000_000,
    appliesTo: ["TUITION", "BOARDING"],
    priority: 40,
  },
};

export const newStudent = (over: Partial<StudentContext> = {}): StudentContext => ({
  siblingOrdinal: 1,
  isFoundingFamily: false,
  isStaffWard: false,
  isNewAdmission: true,
  granted: [],
  ...over,
});
