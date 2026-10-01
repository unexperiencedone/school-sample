import { describe, expect, it } from "vitest";
import {
  allocatePayment,
  computeInvoice,
  computeLateFee,
  eligibility,
  FeeEngineError,
  formatInvoiceNumber,
  formatReceiptNumber,
  instalmentStatus,
  invoiceStatus,
  nextLateFee,
  outstanding,
  quoteRefund,
  repriceInvoice,
  validatePlan,
  type InstalmentState,
} from "@/lib/fee-engine";
import { utcDate } from "@/lib/dates";
import { sum } from "@/lib/money";
import { concessions as C, newStudent, plans, structure } from "./fee-engine.fixtures";

const asOf = utcDate(2026, 3, 1);
const all = Object.values(C);

describe("computeInvoice — charges", () => {
  it("never invoices registration; charges admission only to new admissions", () => {
    const fresh = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [],
      student: newStudent(),
      asOf,
    });
    expect(fresh.lines.map((l) => l.headCode)).toEqual(["ADM", "TUI", "BRD", "ACT"]);
    expect(fresh.subtotalPaise).toBe(120_000_000);

    const continuing = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [],
      student: newStudent({ isNewAdmission: false }),
      asOf,
    });
    expect(continuing.lines.map((l) => l.headCode)).toEqual(["TUI", "BRD", "ACT"]);
    expect(continuing.totalPaise).toBe(105_000_000);
  });

  it("instalments always sum to the invoice total", () => {
    for (const plan of Object.values(plans)) {
      const inv = computeInvoice({
        structure,
        plan,
        concessions: all,
        student: newStudent({ siblingOrdinal: 3, isFoundingFamily: true }),
        asOf,
      });
      expect(sum(inv.instalments.map((i) => i.amountPaise))).toBe(inv.totalPaise);
    }
  });

  it("puts one-time heads entirely in instalment 1 and splits recurring heads by plan %", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.THREE,
      concessions: [],
      student: newStudent(),
      asOf,
    });
    // recurring = 105,000.00; 40/30/30 split; admission 1,50,000 added to #1
    expect(inv.instalments.map((i) => i.amountPaise)).toEqual([
      42_000_000 + 15_000_000,
      31_500_000,
      31_500_000,
    ]);
  });

  it("supports FIXED split plans with the last instalment taking the remainder", () => {
    const fixed = {
      code: "FIX",
      name: "Fixed",
      splitType: "FIXED" as const,
      parts: [
        { seq: 1, label: "Deposit", dueDate: utcDate(2026, 4, 1), fixedPaise: 20_000_000 },
        { seq: 2, label: "Balance", dueDate: utcDate(2026, 8, 1) },
      ],
    };
    const inv = computeInvoice({
      structure,
      plan: fixed,
      concessions: [],
      student: newStudent({ isNewAdmission: false }),
      asOf,
    });
    expect(inv.instalments.map((i) => i.amountPaise)).toEqual([20_000_000, 85_000_000]);
  });

  it("rejects malformed plans and negative amounts", () => {
    expect(() =>
      validatePlan({ ...plans.TWO, parts: [{ ...plans.TWO.parts[0]!, percentBp: 5_000 }] }),
    ).toThrow(FeeEngineError);
    expect(() => validatePlan({ ...plans.TWO, parts: [] })).toThrow(FeeEngineError);
    expect(() =>
      validatePlan({ ...plans.TWO, parts: [plans.TWO.parts[0]!, { ...plans.TWO.parts[1]!, seq: 1 }] }),
    ).toThrow(/duplicate/);
    const bad = { ...structure, lines: [{ head: structure.lines[2]!.head, amountPaise: -1 }] };
    expect(() =>
      computeInvoice({ structure: bad, plan: plans.ONE, concessions: [], student: newStudent(), asOf }),
    ).toThrow(FeeEngineError);
  });
});

describe("computeInvoice — concessions", () => {
  it("evaluates automatic eligibility", () => {
    expect(eligibility(C.SIB!, newStudent({ siblingOrdinal: 1 })).eligible).toBe(false);
    expect(eligibility(C.SIB!, newStudent({ siblingOrdinal: 2 })).eligible).toBe(true);
    expect(eligibility(C.FOUND!, newStudent({ isFoundingFamily: true })).eligible).toBe(true);
    expect(eligibility(C.SCH50!, newStudent()).reason).toBe("not granted");
    expect(eligibility(C.SCH50!, newStudent({ granted: [{ code: "SCH50" }] })).eligible).toBe(true);
    expect(eligibility({ ...C.SIB!, needsApproval: true }, newStudent({ siblingOrdinal: 2 })).reason).toBe(
      "awaiting approval",
    );
  });

  it("applies the sibling waiver to tuition only", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [C.SIB!],
      student: newStudent({ siblingOrdinal: 2, isNewAdmission: false }),
      asOf,
    });
    expect(inv.discountPaise).toBe(6_000_000);
    expect(inv.totalPaise).toBe(99_000_000);
    expect(inv.netByHead.TUI).toBe(54_000_000);
  });

  it("compounds stackable percentages on the remaining amount, in priority order", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [C.FOUND!, C.SIB!],
      student: newStudent({ siblingOrdinal: 2, isFoundingFamily: true, isNewAdmission: false }),
      asOf,
    });
    // SIB (prio 20): 10% of 6,00,000 = 60,000 → TUI 5,40,000
    // FOUND (prio 30): 5% of 5,40,000 = 27,000; 5% of 4,00,000 = 20,000
    expect(inv.applied).toEqual([
      { code: "SIB", amountPaise: 6_000_000 },
      { code: "FOUND", amountPaise: 4_700_000 },
    ]);
    expect(inv.totalPaise).toBe(105_000_000 - 10_700_000);
    expect(inv.breakdown.at(-1)!.runningTotalPaise).toBe(inv.totalPaise);
  });

  it("an exclusive concession applied first blocks later ones", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: all,
      student: newStudent({ siblingOrdinal: 2, isFoundingFamily: true, granted: [{ code: "SCH50" }] }),
      asOf,
    });
    expect(inv.applied.map((a) => a.code)).toEqual(["SCH50"]);
    expect(inv.skipped.find((s) => s.code === "SIB")!.reason).toMatch(/not combinable with SCH50/);
  });

  it("an exclusive concession is skipped if something was already applied", () => {
    const lateExclusive = { ...C.SCH50!, priority: 99 };
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [C.SIB!, lateExclusive],
      student: newStudent({ siblingOrdinal: 2, granted: [{ code: "SCH50" }] }),
      asOf,
    });
    expect(inv.applied.map((a) => a.code)).toEqual(["SIB"]);
    expect(inv.skipped).toContainEqual({ code: "SCH50", reason: "exclusive; SIB already applied" });
  });

  it("honours an approved override percentage", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [C.SCH50!],
      student: newStudent({ isNewAdmission: false, granted: [{ code: "SCH50", overrideBp: 2_500 }] }),
      asOf,
    });
    expect(inv.discountPaise).toBe(15_000_000);
  });

  it("spreads a fixed concession across heads proportionally, capped at the base", () => {
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [C.BURSARY!],
      student: newStudent({ isNewAdmission: false, granted: [{ code: "BURSARY" }] }),
      asOf,
    });
    const line = inv.lines.find((l) => l.kind === "CONCESSION")!;
    expect(line.amountPaise).toBe(-10_000_000);
    expect(line.meta!.perHead).toEqual({ TUI: 6_000_000, BRD: 4_000_000 });

    const huge = { ...C.BURSARY!, valuePaise: 999_000_000 };
    const capped = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [huge],
      student: newStudent({ isNewAdmission: false, granted: [{ code: "BURSARY" }] }),
      asOf,
    });
    expect(capped.discountPaise).toBe(100_000_000);
    expect(capped.totalPaise).toBe(5_000_000);
  });

  it("never lets a head go negative with a 100% concession then another", () => {
    const full = { ...C.SCH50!, valueBp: 10_000, stackable: true, priority: 1 };
    const inv = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [full, C.SIB!],
      student: newStudent({ siblingOrdinal: 2, isNewAdmission: false, granted: [{ code: "SCH50" }] }),
      asOf,
    });
    expect(inv.netByHead.TUI).toBe(0);
    expect(inv.skipped).toContainEqual({ code: "SIB", reason: "no applicable fee heads" });
  });

  it("rejects invalid percentages", () => {
    const bad = { ...C.SIB!, valueBp: 12_000 };
    expect(() =>
      computeInvoice({
        structure,
        plan: plans.ONE,
        concessions: [bad],
        student: newStudent({ siblingOrdinal: 2 }),
        asOf,
      }),
    ).toThrow(FeeEngineError);
  });
});

describe("computeInvoice — advance rebate", () => {
  const rebate = { amountPaise: 2_500_000, payByDate: utcDate(2026, 4, 15) };

  it("applies only to single-instalment plans due by the rebate date", () => {
    const one = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [],
      student: newStudent({ isNewAdmission: false }),
      rebate,
      asOf,
    });
    expect(one.rebatePaise).toBe(2_500_000);
    expect(one.totalPaise).toBe(102_500_000);
    expect(one.instalments[0]!.amountPaise).toBe(102_500_000);

    const three = computeInvoice({
      structure,
      plan: plans.THREE,
      concessions: [],
      student: newStudent(),
      rebate,
      asOf,
    });
    expect(three.rebatePaise).toBe(0);
  });

  it("is not offered after the pay-by date", () => {
    const late = computeInvoice({
      structure,
      plan: plans.ONE,
      concessions: [],
      student: newStudent(),
      rebate,
      asOf: utcDate(2026, 5, 1),
    });
    expect(late.rebatePaise).toBe(0);
  });
});

const inst = (over: Partial<InstalmentState>): InstalmentState => ({
  id: "i1",
  invoiceId: "inv1",
  seq: 1,
  dueDate: utcDate(2026, 4, 10),
  amountPaise: 100_000,
  lateFeePaise: 0,
  lateFeeWaived: false,
  paidPaise: 0,
  ...over,
});

describe("allocatePayment", () => {
  const book = [
    inst({ id: "a2", invoiceId: "A", seq: 2, dueDate: utcDate(2026, 9, 10), amountPaise: 300 }),
    inst({
      id: "a1",
      invoiceId: "A",
      seq: 1,
      dueDate: utcDate(2026, 4, 10),
      amountPaise: 500,
      paidPaise: 200,
    }),
    inst({
      id: "b1",
      invoiceId: "B",
      seq: 1,
      dueDate: utcDate(2026, 6, 1),
      amountPaise: 400,
      lateFeePaise: 50,
    }),
  ];

  it("pays oldest due first across invoices, including late fee", () => {
    const r = allocatePayment({ amountPaise: 700, instalments: book });
    expect(r.allocations).toEqual([
      { instalmentId: "a1", invoiceId: "A", amountPaise: 300 },
      { instalmentId: "b1", invoiceId: "B", amountPaise: 400 },
    ]);
    expect(r.unallocatedPaise).toBe(0);
  });

  it("restricts to a target invoice and returns overpayment as unallocated", () => {
    const r = allocatePayment({ amountPaise: 1_000, instalments: book, invoiceId: "A" });
    expect(r.allocations.map((a) => a.instalmentId)).toEqual(["a1", "a2"]);
    expect(r.unallocatedPaise).toBe(400);
  });

  it("targets a specific instalment first", () => {
    const r = allocatePayment({ amountPaise: 350, instalments: book, instalmentId: "a2" });
    expect(r.allocations).toEqual([
      { instalmentId: "a2", invoiceId: "A", amountPaise: 300 },
      { instalmentId: "a1", invoiceId: "A", amountPaise: 50 },
    ]);
  });

  it("ignores waived late fees and fully-paid instalments", () => {
    expect(outstanding(inst({ amountPaise: 100, lateFeePaise: 30, lateFeeWaived: true }))).toBe(100);
    const r = allocatePayment({ amountPaise: 10, instalments: [inst({ paidPaise: 100_000 })] });
    expect(r).toEqual({ allocations: [], unallocatedPaise: 10 });
  });

  it("rejects zero, negative and fractional amounts", () => {
    expect(() => allocatePayment({ amountPaise: 0, instalments: book })).toThrow();
    expect(() => allocatePayment({ amountPaise: -5, instalments: book })).toThrow();
    expect(() => allocatePayment({ amountPaise: 1.5, instalments: book })).toThrow();
  });

  it("derives instalment and invoice status", () => {
    const due = utcDate(2026, 4, 10);
    expect(instalmentStatus(inst({ dueDate: due }), utcDate(2026, 4, 1))).toBe("DUE");
    expect(instalmentStatus(inst({ dueDate: due, paidPaise: 1 }), utcDate(2026, 4, 1))).toBe("PARTIAL");
    expect(instalmentStatus(inst({ dueDate: due }), utcDate(2026, 4, 11))).toBe("OVERDUE");
    expect(instalmentStatus(inst({ paidPaise: 100_000 }), utcDate(2027, 1, 1))).toBe("PAID");
    expect(invoiceStatus([inst({ paidPaise: 100_000 }), inst({ id: "x", paidPaise: 100_000 })], asOf)).toBe(
      "PAID",
    );
    expect(
      invoiceStatus([inst({ paidPaise: 100_000 }), inst({ id: "x", dueDate: utcDate(2027, 1, 1) })], asOf),
    ).toBe("PARTIAL");
    expect(invoiceStatus([inst({ dueDate: utcDate(2026, 1, 1) })], asOf)).toBe("OVERDUE");
  });
});

describe("late fees", () => {
  const rule = { ratePerMonthBp: 200, graceDays: 7, cancelFlagAfterDays: 90 };

  it("charges nothing within grace", () => {
    expect(computeLateFee(inst({}), rule, utcDate(2026, 4, 17)).feePaise).toBe(0);
  });

  it("charges 2% per started month on outstanding principal", () => {
    expect(computeLateFee(inst({}), rule, utcDate(2026, 4, 18)).feePaise).toBe(2_000);
    const r = computeLateFee(inst({ paidPaise: 50_000 }), rule, utcDate(2026, 6, 10));
    expect(r.monthsCharged).toBe(3);
    expect(r.feePaise).toBe(3_000);
  });

  it("flags (never cancels) after the cancellation threshold", () => {
    expect(computeLateFee(inst({}), rule, utcDate(2026, 7, 10)).flagCancellation).toBe(true);
    expect(computeLateFee(inst({}), rule, utcDate(2026, 5, 10)).flagCancellation).toBe(false);
  });

  it("is idempotent and never decreases a charged fee; waived means zero", () => {
    const i = inst({ lateFeePaise: 5_000, paidPaise: 90_000 });
    expect(nextLateFee(i, rule, utcDate(2026, 5, 20))).toBe(5_000);
    expect(nextLateFee(inst({}), rule, utcDate(2026, 5, 20))).toBe(
      nextLateFee(inst({}), rule, utcDate(2026, 5, 20)),
    );
    expect(nextLateFee(inst({ lateFeeWaived: true, lateFeePaise: 5_000 }), rule, utcDate(2026, 9, 1))).toBe(
      0,
    );
    expect(computeLateFee(inst({ paidPaise: 100_000 }), rule, utcDate(2026, 9, 1)).feePaise).toBe(0);
  });
});

describe("refunds", () => {
  const paid = [
    { headCode: "ADM", name: "Admission", refundable: false, paidPaise: 15_000_000 },
    { headCode: "TUI", name: "Tuition", refundable: true, paidPaise: 60_000_000 },
    { headCode: "BRD", name: "Boarding", refundable: true, paidPaise: 40_000_000 },
  ];
  const year = { yearStart: utcDate(2026, 4, 1), yearEnd: utcDate(2027, 3, 31) };

  it("new pupil before start: refundable heads in full, never admission", () => {
    const q = quoteRefund({
      pupil: "NEW",
      paid,
      withdrawalDate: utcDate(2026, 3, 1),
      noticeGivenDays: 0,
      ...year,
    });
    expect(q.refundablePaise).toBe(100_000_000);
    expect(q.lines.find((l) => l.headCode === "ADM")!.refundPaise).toBe(0);
  });

  it("new pupil after start: nothing by default", () => {
    expect(
      quoteRefund({ pupil: "NEW", paid, withdrawalDate: utcDate(2026, 5, 1), noticeGivenDays: 0, ...year })
        .refundablePaise,
    ).toBe(0);
  });

  it("existing pupil: unconsumed share, minus fees in lieu of short notice", () => {
    const mid = utcDate(2026, 9, 30);
    const withNotice = quoteRefund({
      pupil: "EXISTING",
      paid,
      withdrawalDate: mid,
      noticeGivenDays: 120,
      ...year,
    });
    const shortNotice = quoteRefund({
      pupil: "EXISTING",
      paid,
      withdrawalDate: mid,
      noticeGivenDays: 10,
      ...year,
    });
    expect(withNotice.refundablePaise).toBeGreaterThan(40_000_000);
    expect(withNotice.refundablePaise).toBeLessThan(60_000_000);
    expect(shortNotice.refundablePaise).toBe(withNotice.refundablePaise - 33_330_000);
  });

  it("never refunds more than was paid minus earlier refunds, and never negative", () => {
    const q = quoteRefund({
      pupil: "NEW",
      paid,
      withdrawalDate: utcDate(2026, 3, 1),
      noticeGivenDays: 0,
      alreadyRefundedPaise: 110_000_000,
      ...year,
    });
    expect(q.refundablePaise).toBe(5_000_000);
    const late = quoteRefund({
      pupil: "EXISTING",
      paid,
      withdrawalDate: utcDate(2027, 3, 20),
      noticeGivenDays: 0,
      ...year,
    });
    expect(late.refundablePaise).toBe(0);
  });
});

describe("repricing", () => {
  it("keeps payments, re-spreads them and credits any excess to the wallet", () => {
    const old = computeInvoice({
      structure,
      plan: plans.THREE,
      concessions: [],
      student: newStudent({ isNewAdmission: false }),
      asOf,
    });
    const cheaper = computeInvoice({
      structure: {
        ...structure,
        version: 2,
        lines: structure.lines.map((l) => (l.head.code === "TUI" ? { ...l, amountPaise: 30_000_000 } : l)),
      },
      plan: plans.THREE,
      concessions: [],
      student: newStudent({ isNewAdmission: false }),
      asOf,
    });
    const r = repriceInvoice(
      {
        totalPaise: old.totalPaise,
        paidPaise: 80_000_000,
        instalments: old.instalments.map((i) => ({ seq: i.seq, amountPaise: i.amountPaise, paidPaise: 0 })),
      },
      cheaper,
    );
    expect(r.deltaPaise).toBe(-30_000_000);
    expect(sum(r.instalments.map((i) => i.paidPaise)) + r.walletCreditPaise).toBe(80_000_000);
    expect(r.walletCreditPaise).toBe(5_000_000);
    expect(r.instalments[0]!.oldAmountPaise).toBe(old.instalments[0]!.amountPaise);
  });
});

describe("document numbers", () => {
  it("formats sequential receipt and invoice numbers", () => {
    expect(formatReceiptNumber("AHR", "2026-27", 42)).toBe("AHR/2026-27/000042");
    expect(formatInvoiceNumber("AHI", "2026-27", 7)).toBe("AHI/2026-27/00007");
    expect(() => formatReceiptNumber("AHR", "2026-27", 0)).toThrow();
  });
});
