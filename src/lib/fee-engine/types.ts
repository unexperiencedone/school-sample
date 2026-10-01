/**
 * Fee engine domain types. Deliberately independent of Prisma so the engine is pure and portable.
 * All money is integer paise; all percentages are basis points (10_000 = 100%).
 */
export type HeadKind =
  | "REGISTRATION"
  | "ADMISSION"
  | "TUITION"
  | "BOARDING"
  | "TRANSPORT"
  | "UNIFORM"
  | "BOOKS"
  | "EXAM"
  | "ACTIVITY"
  | "OTHER";

export type FeeHeadDef = {
  code: string;
  name: string;
  kind: HeadKind;
  refundable: boolean;
  oneTime: boolean;
  recurring: boolean;
  taxable: boolean;
};

export type StructureDef = {
  id: string;
  version: number;
  lines: { head: FeeHeadDef; amountPaise: number }[];
};

export type PlanPartDef = {
  seq: number;
  label: string;
  dueDate: Date;
  percentBp?: number | null;
  fixedPaise?: number | null;
};
export type PlanDef = { code: string; name: string; splitType: "PERCENT" | "FIXED"; parts: PlanPartDef[] };

export type ConcessionDef = {
  code: string;
  name: string;
  type: "SCHOLARSHIP" | "SIBLING" | "FOUNDING_FAMILY" | "STAFF_WARD" | "CUSTOM";
  valueType: "PERCENT" | "FIXED";
  valueBp?: number | null;
  valuePaise?: number | null;
  appliesTo: HeadKind[];
  stackable: boolean;
  priority: number;
  needsApproval: boolean;
  automatic: boolean;
  minSiblingOrdinal?: number | null;
};

export type StudentContext = {
  /** 1 = eldest enrolled child of the family, 2 = second, … */
  siblingOrdinal: number;
  isFoundingFamily: boolean;
  isStaffWard: boolean;
  /** New admissions pay one-time heads (admission fee); continuing pupils don't. */
  isNewAdmission: boolean;
  /** Concessions approved for this student/year, optionally with an approved override value. */
  granted: { code: string; overrideBp?: number | null }[];
};

export type RebateDef = { amountPaise: number; payByDate: Date };

export type InvoiceInput = {
  structure: StructureDef;
  plan: PlanDef;
  concessions: ConcessionDef[];
  student: StudentContext;
  rebate?: RebateDef | null;
  asOf: Date;
};

export type ComputedLine = {
  kind: "CHARGE" | "CONCESSION" | "REBATE";
  headCode?: string;
  description: string;
  amountPaise: number; // negative for concessions/rebates
  meta?: Record<string, unknown>;
};

export type BreakdownStep = { label: string; detail: string; amountPaise: number; runningTotalPaise: number };

export type ComputedInstalment = { seq: number; label: string; dueDate: Date; amountPaise: number };

export type InvoiceComputation = {
  lines: ComputedLine[];
  subtotalPaise: number;
  discountPaise: number;
  rebatePaise: number;
  totalPaise: number;
  netByHead: Record<string, number>;
  instalments: ComputedInstalment[];
  breakdown: BreakdownStep[];
  applied: { code: string; amountPaise: number }[];
  skipped: { code: string; reason: string }[];
  structureVersion: number;
};

export type LateFeeRuleDef = {
  ratePerMonthBp: number;
  graceDays: number;
  cancelFlagAfterDays?: number | null;
};

export type InstalmentState = {
  id: string;
  invoiceId: string;
  seq: number;
  dueDate: Date;
  amountPaise: number;
  lateFeePaise: number;
  lateFeeWaived: boolean;
  paidPaise: number;
};

export type RefundPolicy = {
  newPupil: { beforeStartBp: number; afterStartBp: number };
  existingPupil: { noticeDays: number; inLieuOfNoticeBp: number };
};

export class FeeEngineError extends Error {
  readonly code = "FEE_ENGINE";
}
