import { isDeepStrictEqual } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkbook } from "./reports.fixtures";
import { ForbiddenError } from "@/lib/rbac";
import { REPORT_SLUGS } from "@/lib/reports/catalog";
import { reachedWhere, type FunnelLevel } from "@/lib/reports/funnel";

type Rec = Record<string, unknown>;
type Args = { where?: Rec; by?: string[]; _sum?: Rec };

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Canned rows for the tables the reports read; each test overrides what it needs. */
const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; email: string; name: string | null; role: string } | null,
    audits: [] as Rec[],
    calls: [] as { fn: string; args: unknown }[],
    data: {} as Rec,
  };
  const record = <T>(fn: string, args: unknown, value: T): T => {
    state.calls.push({ fn, args });
    return value;
  };
  return { state, record };
});

const data = <T>(key: string) => h.state.data[key] as T;

vi.mock("@/lib/db", () => {
  const rec = h.record;
  const db = {
    academicYear: {
      findMany: async (a: unknown) => rec("academicYear.findMany", a, data<Rec[]>("years")),
    },
    payment: {
      findMany: async (a: Args) => rec("payment.findMany", a, data<Rec[]>("payments")),
    },
    instalment: {
      groupBy: async (a: Args) =>
        rec(
          "instalment.groupBy",
          a,
          data<Rec[]>(a._sum && "lateFeePaise" in a._sum ? "billedLate" : "billedPrincipal"),
        ),
      findMany: async (a: Args) => rec("instalment.findMany", a, data<Rec[]>("openInstalments")),
    },
    feeHead: { findMany: async () => data<Rec[]>("feeHeads") },
    invoice: { findMany: async () => data<Rec[]>("invoices") },
    invoiceLine: { findMany: async () => data<Rec[]>("lines") },
    lead: {
      count: async (a: Args) =>
        rec("lead.count", a, data<Record<number, number>>("leadCounts")[levelOf(a.where)] ?? 0),
      groupBy: async (a: Args) => {
        const layer = levelOf(a.where);
        const dim = a.by!.length === 1 ? "placement" : "campaign";
        return rec("lead.groupBy", a, data<Record<string, Rec[]>>("leadGroups")[`${dim}:${layer}`] ?? []);
      },
    },
    applicationEvent: { findMany: async () => data<Rec[]>("events") },
    application: {
      findMany: async () => data<Rec[]>("linkedApplications"),
      count: async () => data<number>("unlinked"),
      groupBy: async (a: Args) =>
        rec("application.groupBy", a, data<Record<string, Rec[]>>("appGroups")[a.by!.join("+")] ?? []),
    },
    classLevel: { findMany: async () => data<Rec[]>("classes") },
    section: { groupBy: async () => data<Rec[]>("sections") },
    student: {
      findMany: async () => data<Rec[]>("roll"),
      groupBy: async () => data<Rec[]>("rollGroups"),
    },
  };
  return { db };
});

const LEVELS: FunnelLevel[] = [0, 1, 2, 3, 4, 5];
function levelOf(where: Rec | undefined): number {
  const second = (where?.AND as unknown[] | undefined)?.[1];
  const hit = LEVELS.find((l) => isDeepStrictEqual(second, reachedWhere(l)));
  if (hit === undefined) throw new Error("query did not use reachedWhere()");
  return hit;
}

vi.mock("@/lib/audit", () => ({
  audit: async (a: Rec) => {
    h.state.audits.push(a);
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.state.user }));

const YEARS = [
  { id: "y27", name: "2027-28", startDate: utc(2027, 4, 1), endDate: utc(2028, 3, 31), isCurrent: false },
  { id: "y26", name: "2026-27", startDate: utc(2026, 4, 1), endDate: utc(2027, 3, 31), isCurrent: true },
  { id: "y25", name: "2025-26", startDate: utc(2025, 4, 1), endDate: utc(2026, 3, 31), isCurrent: false },
];

/** A payment row as the collections report selects it; noon IST on the given day. */
function pay(p: {
  at: [number, number, number];
  method: string;
  amount: number;
  refunded?: number;
  purpose: string | null;
  alloc: Record<string, number>;
}) {
  return {
    method: p.method,
    receivedAt: new Date(Date.UTC(p.at[0], p.at[1] - 1, p.at[2], 6, 30)),
    amountPaise: p.amount,
    refundedPaise: p.refunded ?? 0,
    order: p.purpose ? { purpose: p.purpose } : null,
    allocations: Object.entries(p.alloc).map(([invoiceId, amountPaise]) => ({ invoiceId, amountPaise })),
  };
}

const svc = await import("@/lib/services/reports");
const route = await import("@/app/api/admin/reports/[report]/route");

const NOW = new Date("2026-10-02T09:34:00Z");
const accounts = { id: "u-acc", role: "ACCOUNTS" as const };
const principal = { id: "u-prn", role: "PRINCIPAL" as const };
const rows = (t: { rows: unknown[][] }) => t.rows;
const table = (r: Awaited<ReturnType<typeof svc.runReport>>, id: string) =>
  r.tables.find((t) => t.id === id)!;

beforeEach(() => {
  h.state.audits = [];
  h.state.calls = [];
  h.state.user = null;
  h.state.data = {
    classes: [],
    sections: [],
    roll: [],
    rollGroups: [],
    appGroups: {},
    years: YEARS,
    openInstalments: [],
    leadCounts: {},
    leadGroups: {},
    events: [],
    linkedApplications: [],
    unlinked: 0,
    payments: [
      // fee receipts: 450_000 applied to invoices and 50_000 of overpayment credited to a wallet
      pay({
        at: [2026, 4, 10],
        method: "UPI",
        amount: 250_000,
        purpose: "INVOICE",
        alloc: { inv1: 250_000 },
      }),
      pay({
        at: [2026, 4, 20],
        method: "UPI",
        amount: 50_000,
        purpose: "INSTALMENT",
        alloc: { inv1: 50_000 },
      }),
      pay({
        at: [2026, 5, 5],
        method: "CASH",
        amount: 200_000,
        refunded: 50_000,
        purpose: null,
        alloc: { inv1: 100_000, inv2: 50_000 },
      }),
      // not fees: a registration fee, a pocket-money top-up and a payment applied to no invoice
      pay({ at: [2026, 4, 15], method: "UPI", amount: 100_000, purpose: "REGISTRATION", alloc: {} }),
      pay({ at: [2026, 5, 3], method: "UPI", amount: 500_000, purpose: "IMPREST_TOPUP", alloc: {} }),
      pay({ at: [2026, 6, 1], method: "CASH", amount: 20_000, refunded: 5_000, purpose: null, alloc: {} }),
    ],
    billedPrincipal: [
      { invoiceId: "inv1", _sum: { amountPaise: 600_000 } },
      { invoiceId: "inv2", _sum: { amountPaise: 100_000 } },
    ],
    billedLate: [{ invoiceId: "inv1", _sum: { lateFeePaise: 10_000 } }],
    feeHeads: [
      { code: "TUI", name: "Tuition" },
      { code: "BRD", name: "Boarding" },
    ],
    invoices: [
      { id: "inv1", student: { class: { id: "c7", name: "Year 7", order: 9 } } },
      { id: "inv2", student: { class: { id: "c8", name: "Year 8", order: 10 } } },
    ],
    lines: [
      { invoiceId: "inv1", feeHeadCode: "TUI", amountPaise: 300_000 },
      { invoiceId: "inv1", feeHeadCode: "BRD", amountPaise: 100_000 },
      { invoiceId: "inv2", feeHeadCode: "TUI", amountPaise: 50_000 },
    ],
  };
});

describe("collections report", () => {
  it("builds month, class, fee head and method tables from fee receipts only, all agreeing with the totals", async () => {
    const r = await svc.runReport(accounts, "collections", {}, NOW);
    expect(r.period).toBe("2026-27 · 1 Apr 2026 – 31 Mar 2027");
    expect(r.filter).toEqual({ year: "2026-27", from: null, to: null });
    expect(r.years).toEqual(["2027-28", "2026-27", "2025-26"]);

    const month = table(r, "by-month");
    expect(rows(month)).toHaveLength(12);
    expect(rows(month)[0]).toEqual(["Apr 2026", 2, 300_000, 0, 300_000]);
    expect(rows(month)[1]).toEqual(["May 2026", 1, 200_000, 50_000, 150_000]);
    expect(rows(month)[2]).toEqual(["Jun 2026", 0, 0, 0, 0]);
    expect(month.totals).toEqual(["Total", 3, 500_000, 50_000, 450_000]);

    const klass = table(r, "by-class");
    expect(rows(klass)).toEqual([
      ["Year 7", 610_000, 400_000, 6_557],
      ["Year 8", 100_000, 50_000, 5_000],
      ["Overpayment credited to wallet", null, 50_000, null],
    ]);
    expect(klass.totals).toEqual(["Total", 710_000, 500_000, 7_042]);

    const head = table(r, "by-head");
    expect(rows(head)).toEqual([
      ["Tuition", 350_000, 7_000],
      ["Boarding", 100_000, 2_000],
      ["Overpayment credited to wallet", 50_000, 1_000],
    ]);

    const method = table(r, "by-method");
    expect(rows(method)).toEqual([
      ["UPI", 2, 300_000, 0, 300_000],
      ["Cash", 1, 200_000, 50_000, 150_000],
    ]);

    expect(r.headline).toEqual({ value: "₹4,500", label: "Net fees collected, 2026-27" });
    expect(r.kpis.map((k) => k.label)).toEqual(["Billed", "Collected", "Refunded", "Net collected"]);
    expect(r.kpis[1]!.value).toBe("₹5,000");
  });

  it("makes every fee table equal the headline: rows add up to the totals and the totals to the collected figure", async () => {
    const r = await svc.runReport(accounts, "collections", {}, NOW);
    const collected = (id: string, column: number) => {
      const t = table(r, id);
      const sum = rows(t).reduce((n, row) => n + (row[column] as number), 0);
      expect(sum, `${id} rows add up to its total`).toBe(t.totals![column]);
      return sum;
    };
    const fee = collected("by-month", 2);
    expect(collected("by-class", 2)).toBe(fee);
    expect(collected("by-head", 1)).toBe(fee);
    expect(collected("by-method", 2)).toBe(fee);
    expect(fee).toBe(500_000);
  });

  it("keeps registration fees, pocket money and unapplied payments out of the fee figures and lists them apart", async () => {
    const r = await svc.runReport(accounts, "collections", {}, NOW);
    const other = table(r, "other-receipts");
    expect(other.title).toBe("Other receipts (not fees)");
    expect(other.caption).toContain("Registration fees, pocket-money top-ups");
    expect(rows(other)).toEqual([
      ["Registration fees", 1, 100_000, 0, 100_000],
      ["Pocket-money top-ups", 1, 500_000, 0, 500_000],
      ["Payments not applied to any invoice", 1, 20_000, 5_000, 15_000],
    ]);
    expect(other.totals).toEqual(["Total", 3, 620_000, 5_000, 615_000]);
    expect(r.notes.join(" ")).toContain("Other receipts");
  });

  it("does not let a pocket-money top-up move the headline in a month with no fee payments", async () => {
    h.state.data.payments = [
      pay({ at: [2026, 6, 2], method: "UPI", amount: 500_000, purpose: "IMPREST_TOPUP", alloc: {} }),
    ];
    h.state.data.billedPrincipal = [{ invoiceId: "inv1", _sum: { amountPaise: 600_000 } }];
    h.state.data.billedLate = [];
    const r = await svc.runReport(accounts, "collections", {}, NOW);
    expect(r.headline.value).toBe("₹0");
    expect(r.kpis[3]!.sub).toMatch(/^0\.0%|^0%/);
    expect(table(r, "by-month").totals).toEqual(["Total", 0, 0, 0, 0]);
    expect(rows(table(r, "by-method"))).toEqual([]);
    expect(table(r, "by-class").totals![2]).toBe(0);
    expect(table(r, "other-receipts").totals).toEqual(["Total", 1, 500_000, 0, 500_000]);
  });

  it("asks for receipts in the window, leaving failed payments out, and buckets them by IST month", async () => {
    await svc.runReport(accounts, "collections", {}, NOW);
    const reads = h.state.calls.filter((c) => c.fn === "payment.findMany").map((c) => c.args as Args);
    expect(reads).toHaveLength(1);
    expect(reads[0]!.where!.status).toEqual({ not: "FAILED" });
    const window = reads[0]!.where!.receivedAt as { gte: Date; lt: Date };
    expect(window.gte.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(window.lt.toISOString()).toBe("2027-03-31T18:30:00.000Z");

    // 23:50 IST on 30 April and 00:10 IST on 1 May land in different months
    h.state.data.payments = [
      {
        ...pay({ at: [2026, 4, 30], method: "UPI", amount: 1_000, purpose: null, alloc: { inv1: 1_000 } }),
        receivedAt: new Date("2026-04-30T18:20:00Z"),
      },
      {
        ...pay({ at: [2026, 5, 1], method: "UPI", amount: 2_000, purpose: null, alloc: { inv1: 2_000 } }),
        receivedAt: new Date("2026-04-30T18:40:00Z"),
      },
    ];
    const r = await svc.runReport(accounts, "collections", {}, NOW);
    expect(rows(table(r, "by-month")).slice(0, 2)).toEqual([
      ["Apr 2026", 1, 1_000, 0, 1_000],
      ["May 2026", 1, 2_000, 0, 2_000],
    ]);
  });

  it("narrows to a typed range", async () => {
    const r = await svc.runReport(accounts, "collections", { from: "2026-05-10", to: "2026-06-05" }, NOW);
    expect(rows(table(r, "by-month")).map((row) => row[0])).toEqual(["May 2026", "Jun 2026"]);
    expect(r.filter).toEqual({ year: "2026-27", from: "2026-05-10", to: "2026-06-05" });
  });
});

describe("outstanding report", () => {
  beforeEach(() => {
    const student = (id: string, cls: string, order: number, guardian: Rec | null) => ({
      id,
      firstName: `P${id}`,
      lastName: "Test",
      class: { id: cls, name: cls, order },
      guardians: guardian ? [{ guardian }] : [],
    });
    const inst = (dueDate: Date, s: Rec, o: Rec = {}) => ({
      dueDate,
      amountPaise: 100_000,
      lateFeePaise: 0,
      lateFeeWaived: false,
      paidPaise: 0,
      invoice: { student: s },
      ...o,
    });
    const mum = { id: "g1", name: "Meera Sample" };
    h.state.data.openInstalments = [
      inst(utc(2026, 7, 1), student("a", "Year 7", 9, mum)), // 93 days
      inst(utc(2026, 9, 1), student("b", "Year 8", 10, mum), { lateFeePaise: 4_000 }), // 31 days, sibling
      inst(utc(2026, 10, 2), student("c", "Year 8", 10, null)), // due today
    ];
  });

  it("ages by IST due date, groups siblings under their primary guardian and ties out", async () => {
    const r = await svc.runReport(principal, "outstanding", {}, NOW);
    const ageing = table(r, "ageing");
    expect(rows(ageing).map((row) => [row[0], row[1], row[4]])).toEqual([
      ["Not yet due", 1, 100_000],
      ["1–30 days", 0, 0],
      ["31–60 days", 1, 104_000],
      ["61–90 days", 0, 0],
      ["Over 90 days", 1, 100_000],
    ]);
    expect(ageing.totals).toEqual(["Total", 3, 300_000, 4_000, 304_000, 10_000]);
    const klass = table(r, "by-class");
    expect(rows(klass)[0]).toEqual(["Year 7", 1, 100_000, 0, 100_000, 0, 0, 0, 0, 100_000]);
    expect(klass.totals![4]).toBe(304_000);
    const families = table(r, "top-families");
    expect(rows(families)[0]).toEqual(["Meera Sample", 2, 200_000, 4_000, 204_000, 204_000, 93]);
    expect(rows(families)[1]![0]).toBe("Pc Test (no guardian on record)");
    expect(r.headline.value).toBe("₹3,040");
    expect(r.period).toBe("2026-27 invoices · as at 2 Oct 2026");
  });

  it("reads only the chosen year's live invoices and applies a due-date range when typed", async () => {
    await svc.runReport(principal, "outstanding", { from: "2026-08-01", to: "2026-08-31" }, NOW);
    const where = (h.state.calls.find((c) => c.fn === "instalment.findMany")!.args as Args).where!;
    expect(where.status).toEqual({ notIn: ["PAID", "WAIVED"] });
    expect(where.invoice).toEqual({ yearId: "y26", status: { notIn: ["VOID", "WAIVED", "DRAFT"] } });
    expect(where.dueDate).toEqual({ gte: utc(2026, 8, 1), lt: utc(2026, 9, 1) });
  });
});

describe("funnel report", () => {
  beforeEach(() => {
    h.state.data.leadCounts = { 0: 200, 1: 120, 2: 90, 3: 60, 4: 30, 5: 15 };
    const at = (d: number) => new Date(Date.UTC(2026, 5, d));
    h.state.data.events = [
      { applicationId: "a", toStage: "REGISTERED", createdAt: at(1) },
      { applicationId: "a", toStage: "DOCUMENTS", createdAt: at(4) },
      { applicationId: "b", toStage: "REGISTERED", createdAt: at(2) },
      { applicationId: "b", toStage: "DOCUMENTS", createdAt: at(3) },
    ];
    h.state.data.linkedApplications = [
      { createdAt: at(10), lead: { createdAt: at(8) } },
      { createdAt: at(10), lead: { createdAt: at(4) } },
    ];
    h.state.data.unlinked = 3;
  });

  it("counts enquiries per step, converts them and measures time in stage", async () => {
    const r = await svc.runReport(principal, "funnel", {}, NOW);
    const f = table(r, "funnel");
    expect(rows(f)).toEqual([
      ["Enquiries", 200, null, 10_000],
      ["Tours booked", 120, 6_000, 6_000],
      ["Tours done", 90, 7_500, 4_500],
      ["Applications", 60, 6_667, 3_000],
      ["Offers", 30, 5_000, 1_500],
      ["Admitted", 15, 5_000, 750],
    ]);
    const stage = table(r, "time-in-stage");
    expect(rows(stage)[0]).toEqual(["Enquiry to registration", 2, 4]);
    expect(rows(stage)[1]).toEqual(["Registered (time spent)", 2, 2]);
    expect(rows(stage)[2]).toEqual(["Document check (time spent)", 0, null]);
    expect(r.headline).toEqual({ value: "7.5%", label: "of enquiries admitted, 2026-27" });
    expect(r.notes.join(" ")).toContain("3 applications created in the period had no linked enquiry");
  });

  it("counts leads created in the IST window, merged duplicates excluded", async () => {
    await svc.runReport(principal, "funnel", {}, NOW);
    const first = h.state.calls.find((c) => c.fn === "lead.count")!.args as Args;
    const created = (first.where!.AND as Rec[])[0]!;
    expect(created.mergedIntoId).toBeNull();
    expect((created.createdAt as { gte: Date }).gte.toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });
});

describe("sources report", () => {
  beforeEach(() => {
    const g = (key: Rec, n: number) => ({ ...key, _count: n });
    h.state.data.leadGroups = {
      "placement:0": [g({ source: "drawer" }, 10), g({ source: "walk-in" }, 4)],
      "placement:1": [g({ source: "drawer" }, 6)],
      "placement:3": [g({ source: "drawer" }, 4), g({ source: "walk-in" }, 1)],
      "placement:5": [g({ source: "drawer" }, 1)],
      "campaign:0": [
        g({ utmSource: "google", utmCampaign: "admissions-2027" }, 9),
        g({ utmSource: null, utmCampaign: null }, 5),
      ],
      "campaign:3": [g({ utmSource: "google", utmCampaign: "admissions-2027" }, 5)],
    };
  });

  it("joins placement and campaign layers with conversion and labels", async () => {
    const r = await svc.runReport(principal, "sources", {}, NOW);
    const p = table(r, "by-placement");
    expect(rows(p)[0]).toEqual(["Enquiry drawer", 10, 7_143, 6, 4, 1, 4_000, 1_000]);
    expect(rows(p)[1]).toEqual(["Walk-in", 4, 2_857, 0, 1, 0, 2_500, 0]);
    expect(p.totals).toEqual(["Total", 14, 10_000, 6, 5, 1, 3_571, 714]);
    const c = table(r, "by-campaign");
    expect(rows(c)[0]).toEqual(["google", "admissions-2027", 9, 6_429, 0, 5, 0, 5_556, 0]);
    expect(rows(c)[1]!.slice(0, 2)).toEqual(["(none)", "(none)"]);
    expect(r.headline.label).toBe("of enquiries from Enquiry drawer, 2026-27");
  });
});

describe("seats report", () => {
  beforeEach(() => {
    h.state.data.classes = [
      { id: "c6", name: "Year 6", order: 8 },
      { id: "c7", name: "Year 7", order: 9 },
      { id: "c13", name: "Year 13", order: 15 },
    ];
    h.state.data.sections = [
      { classId: "c6", _sum: { capacity: 40 } },
      { classId: "c7", _sum: { capacity: 40 } },
    ];
    h.state.data.rollGroups = [
      { classId: "c6", _count: 35 },
      { classId: "c7", _count: 41 },
    ];
    h.state.data.roll = [
      ...Array.from({ length: 30 }, () => ({ class: { order: 8 } })), // move up into Year 7
      ...Array.from({ length: 5 }, () => ({ class: { order: 9 } })), // move up into Year 8 (no sections)
    ];
    h.state.data.appGroups = {
      "classId+stage": [
        { classId: "c6", stage: "OFFER", _count: 2 },
        { classId: "c7", stage: "OFFER", _count: 3 },
        { classId: "c7", stage: "FEE_PAID", _count: 4 },
      ],
      classId: [
        { classId: "c6", _count: 3 },
        { classId: "c7", _count: 2 },
      ],
    };
  });

  it("reads a current year straight off its roll and flags an over-subscribed class", async () => {
    const r = await svc.runReport(principal, "seats", {}, NOW);
    const t = table(r, "by-class");
    expect(rows(t)).toEqual([
      ["Year 6", 40, 35, 2, 3, 3, "Open"],
      ["Year 7", 40, 45, 3, 2, -8, "Over by 8"],
    ]);
    expect(t.totals).toEqual(["Total", 80, 80, 5, 5, -5, "1 over"]);
    expect(r.kpis.find((k) => k.label === "Seats left")).toMatchObject({ value: "-5", status: "critical" });
    expect(r.period).toBe("2026-27 · as at 2 Oct 2026");
  });

  it("treats a future year as an intake filled by pupils moving up", async () => {
    const r = await svc.runReport(principal, "seats", { year: "2027-28" }, NOW);
    const t = table(r, "by-class");
    // Year 7 intake: 30 moving up from Year 6 + 4 accepted; 3 offers out
    expect(rows(t)[1]).toEqual(["Year 7", 40, 34, 3, 2, 3, "Open"]);
    expect(t.caption).toContain("moving up from 2026-27");
  });
});

describe("access and audit", () => {
  const roleOf = (role: string) => ({ id: `u-${role}`, role }) as Parameters<typeof svc.runReport>[0];
  const READ = ["ADMISSIONS", "REGISTRAR", "HR", "ACCOUNTS", "PRINCIPAL", "SUPER_ADMIN"] as const;
  const OPENS: Record<(typeof READ)[number], string[]> = {
    SUPER_ADMIN: ["collections", "outstanding", "funnel", "sources", "seats"],
    PRINCIPAL: ["collections", "outstanding", "funnel", "sources", "seats"],
    ACCOUNTS: ["collections", "outstanding", "funnel", "seats"],
    ADMISSIONS: ["outstanding", "funnel", "sources", "seats"],
    REGISTRAR: ["outstanding", "funnel", "seats"],
    HR: [],
  };

  it("refuses roles without reports:read outright", async () => {
    await expect(svc.runReport(roleOf("TEACHER"), "seats", {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.reportHub(roleOf("HOUSEPARENT"), NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets each role run only the reports whose data it may read", async () => {
    for (const role of READ) {
      for (const slug of REPORT_SLUGS) {
        const run = svc.runReport(roleOf(role), slug, {}, NOW);
        if (OPENS[role].includes(slug)) await expect(run, `${role} ${slug}`).resolves.toMatchObject({ slug });
        else await expect(run, `${role} ${slug}`).rejects.toBeInstanceOf(ForbiddenError);
      }
    }
  });

  it("keeps fee reports and named debtor families from HR, and fee collections from Admissions and Registrar", async () => {
    for (const role of ["HR", "ADMISSIONS", "REGISTRAR"] as const)
      await expect(svc.runReport(roleOf(role), "collections", {}, NOW)).rejects.toMatchObject({
        permission: "payments:read",
      });
    await expect(svc.runReport(roleOf("HR"), "outstanding", {}, NOW)).rejects.toMatchObject({
      permission: "fees:read",
    });
    await expect(svc.runReport(roleOf("REGISTRAR"), "sources", {}, NOW)).rejects.toMatchObject({
      permission: "leads:read",
    });
  });

  it("builds the hub from only the reports the role may open, and reads nothing for the rest", async () => {
    const accountsHub = await svc.reportHub(accounts, NOW);
    expect(accountsHub).toMatchObject({ status: "ready", year: "2026-27" });
    expect(accountsHub.status === "ready" && accountsHub.cards.map((c) => c.slug)).toEqual([
      "collections",
      "outstanding",
      "funnel",
      "seats",
    ]);

    h.state.calls = [];
    const admissions = await svc.reportHub(roleOf("ADMISSIONS"), NOW);
    expect(admissions.status === "ready" && admissions.cards.map((c) => c.slug)).toEqual([
      "outstanding",
      "funnel",
      "sources",
      "seats",
    ]);
    expect(h.state.calls.some((c) => c.fn === "payment.findMany")).toBe(false);

    h.state.calls = [];
    await expect(svc.reportHub(roleOf("HR"), NOW)).resolves.toEqual({ status: "none-allowed" });
    expect(h.state.calls).toEqual([]);
  });

  it("lets only reports:export roles download, and leaves no trace when refused", async () => {
    for (const role of ["ADMISSIONS", "HR", "REGISTRAR", "TEACHER"] as const) {
      await expect(
        svc.exportReport({ id: "x", role }, "collections", {}, "csv", undefined, NOW),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(h.state.audits).toEqual([]);
    expect(h.state.calls).toEqual([]);
  });

  it("also needs the report's own permission to download it", async () => {
    await expect(svc.exportReport(accounts, "sources", {}, "csv", undefined, NOW)).rejects.toMatchObject({
      permission: "leads:read",
    });
    expect(h.state.audits).toEqual([]);
    expect(h.state.calls).toEqual([]);
  });

  it("audits every export with the filter it used", async () => {
    const csv = await svc.exportReport(
      accounts,
      "collections",
      { from: "2026-05-01" },
      "csv",
      "by-method",
      NOW,
    );
    expect(csv.format).toBe("csv");
    expect(csv.filename).toBe("aurelia-collections-2026-27-20261002-by-method.csv");
    expect(csv.body).toMatch(/^Method,Receipts,Collected \(INR\),Refunded \(INR\),Net collected \(INR\)\r\n/);
    expect(h.state.audits).toHaveLength(1);
    expect(h.state.audits[0]).toMatchObject({
      actor: accounts,
      action: "report.export",
      entity: "Report",
      entityId: "collections",
      after: {
        format: "csv",
        table: "by-method",
        rows: 2,
        filter: { year: "2026-27", from: "2026-05-01", to: null },
      },
    });
    expect(String(h.state.audits[0]!.reason)).toContain("CSV");
  });

  it("exports every table as a sheet of a workbook, and refuses an unknown table", async () => {
    const x = await svc.exportReport(principal, "collections", {}, "xlsx", undefined, NOW);
    expect(x.format).toBe("xlsx");
    expect(x.contentType).toBe(svc.XLSX_CONTENT_TYPE);
    const wb = await loadWorkbook(x.body as Uint8Array<ArrayBuffer>);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Collected by month",
      "Billed and collected by class",
      "Collected by fee head",
      "Collected by payment method",
      "Other receipts (not fees)",
    ]);
    expect(wb.worksheets[0]!.getCell("A1").value).toBe("Fee collections: Collected by month");
    expect(h.state.audits[0]).toMatchObject({ after: { format: "xlsx", table: "all" } });

    h.state.audits = [];
    await expect(svc.exportReport(principal, "collections", {}, "csv", "nope", NOW)).rejects.toMatchObject({
      status: 404,
    });
    expect(h.state.audits).toEqual([]);
  });
});

describe("no academic year", () => {
  beforeEach(() => {
    h.state.data.years = [];
  });

  it("is a 409 NO_ACADEMIC_YEAR for a report, never a crash", async () => {
    for (const slug of REPORT_SLUGS) {
      const run = svc.runReport(principal, slug, {}, NOW);
      await expect(run, slug).rejects.toMatchObject({ status: 409, code: "NO_ACADEMIC_YEAR" });
      await run.catch((e: unknown) => expect(svc.isNoAcademicYear(e)).toBe(true));
    }
    await expect(svc.exportReport(principal, "collections", {}, "csv", undefined, NOW)).rejects.toMatchObject(
      { status: 409, code: "NO_ACADEMIC_YEAR" },
    );
    expect(h.state.audits).toEqual([]);
  });

  it("gives the hub a no-year status and reads no report data", async () => {
    await expect(svc.reportHub(principal, NOW)).resolves.toEqual({ status: "no-year" });
    expect(h.state.calls.map((c) => c.fn)).toEqual(["academicYear.findMany"]);
  });
});

describe("GET /api/admin/reports/[report]", () => {
  const get = (report: string, qs = "") =>
    route.GET(new Request(`http://localhost/api/admin/reports/${report}${qs}`), {
      params: Promise.resolve({ report }),
    });
  const signIn = (role: string) => {
    h.state.user = { id: `u-${role}`, email: `${role}@aurelia-sample.test`, name: null, role };
  };

  it("answers 401 signed out and 403 without reports:export", async () => {
    expect((await get("collections", "?format=csv")).status).toBe(401);
    signIn("TEACHER");
    const denied = await get("collections", "?format=csv");
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("FORBIDDEN");
    signIn("REGISTRAR");
    expect((await get("collections", "?format=xlsx")).status).toBe(403);
    expect(h.state.audits).toEqual([]);
  });

  it("answers 403 for a report whose data the role may not read, even with reports:export", async () => {
    signIn("ACCOUNTS");
    const res = await get("sources", "?format=csv");
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(h.state.audits).toEqual([]);
  });

  it("answers 409 NO_ACADEMIC_YEAR rather than 500 when no year exists", async () => {
    h.state.data.years = [];
    signIn("PRINCIPAL");
    const res = await get("collections", "?format=csv");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_ACADEMIC_YEAR");
    expect(h.state.audits).toEqual([]);
  });

  it("serves CSV with a byte order mark, a download name and no caching", async () => {
    signIn("ACCOUNTS");
    const res = await get("collections", "?format=csv&year=2026-27");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="aurelia-collections-2026-27-\d{8}\.csv"$/,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n")[0]).toBe(
      "Month,Receipts,Collected (INR),Refunded (INR),Net collected (INR)",
    );
  });

  it("serves a real workbook", async () => {
    signIn("PRINCIPAL");
    const res = await get("seats", "?format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(svc.XLSX_CONTENT_TYPE);
    const wb = await loadWorkbook(Buffer.from(await res.arrayBuffer()));
    expect(wb.worksheets).toHaveLength(1);
  });

  it("validates the report, format and filter", async () => {
    signIn("ACCOUNTS");
    expect((await get("payroll", "?format=csv")).status).toBe(404);
    expect((await get("collections", "?format=pdf")).status).toBe(422);
    expect((await get("collections", "?format=csv&from=2026-13-40")).status).toBe(422);
    expect((await get("collections", "?format=csv&from=2026-09-01&to=2026-08-01")).status).toBe(422);
    expect(h.state.audits).toEqual([]);
  });
});
