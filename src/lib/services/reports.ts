import "server-only";
import type { ApplicationStage, PaymentMethod, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { formatDate, formatDateTime, istDateOnly } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { AGEING_BUCKETS } from "@/lib/reports/ageing";
import { REPORT_META, reportsFor, type ReportSlug } from "@/lib/reports/catalog";
import { apportionToFeeHeads, NO_FEE_HEAD, summariseReceipts } from "@/lib/reports/collections";
import { reportCsv } from "@/lib/reports/csv";
import {
  reportFilterSchema,
  resolveWindow,
  monthWindows,
  type ReportFilter,
  type ReportWindow,
  type YearRef,
} from "@/lib/reports/filter";
import {
  funnelRows,
  median,
  reachedWhere,
  roundDays,
  stageDurations,
  type FunnelLevel,
} from "@/lib/reports/funnel";
import { summariseOutstanding, type OutstandingRow } from "@/lib/reports/outstanding";
import { seatPosition } from "@/lib/reports/seats";
import { groupKey, mergeSourceCounts, parseGroupKey, type SourceRow } from "@/lib/reports/sources";
import {
  col,
  formatBp,
  ratioBp,
  type ReportCell,
  type ReportKpi,
  type ReportTable,
} from "@/lib/reports/table";
import { buildWorkbook } from "@/lib/reports/xlsx";
import { sourceLabel } from "./leads";
import { PIPELINE, STAGE_LABEL } from "./admissions";
import { seatsForIntake, type SeatRow } from "./dashboard";

/**
 * Reports (module 13). Every report is built once, as typed tables, and the page, the CSV and the XLSX all render
 * those same tables. Reading needs `reports:read`, downloading needs `reports:export` and is audited, and each
 * report also needs the permission of the data it shows (see `REPORT_META`), so a role never sees through a report
 * what it could not open on its own screen.
 */

type Actor = { id: string; role: Role };

export type ReportResult = {
  slug: ReportSlug;
  title: string;
  description: string;
  /** What the numbers cover, e.g. "2026-27 · 1 Apr 2026 – 31 Mar 2027". */
  period: string;
  /** The filter as resolved (year name, typed range), for links, exports and the audit trail. */
  filter: { year: string; from: string | null; to: string | null };
  years: string[];
  headline: { value: string; label: string };
  kpis: ReportKpi[];
  tables: ReportTable[];
  notes: string[];
  generatedAt: Date;
};

type Body = Pick<ReportResult, "period" | "headline" | "kpis" | "tables" | "notes">;
type Ctx = { w: ReportWindow; now: Date; years: YearRef[] };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const inr = (paise: number) => formatINR(paise, { compact: true });
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const n0 = (v: number | null | undefined) => v ?? 0;
/** A typed filter day for display; an open end reads "…". */
const dayLabel = (day: string | null) => (day ? formatDate(new Date(`${day}T00:00:00Z`)) : "…");

/* ───────────────────────────── Collections ───────────────────────────── */

const METHOD_LABEL: Record<PaymentMethod, string> = {
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  BANK_TRANSFER: "Bank transfer",
  DEMAND_DRAFT: "Demand draft",
  CHEQUE: "Cheque",
  CASH: "Cash",
  WALLET: "Wallet",
};

const WALLET_CREDIT = "Overpayment credited to wallet";

const OTHER_LABEL = {
  REGISTRATION: "Registration fees",
  IMPREST_TOPUP: "Pocket-money top-ups",
  UNALLOCATED: "Payments not applied to any invoice",
} as const;

async function collections({ w }: Ctx): Promise<Body> {
  const billedWhere: Prisma.InstalmentWhereInput = {
    status: { not: "WAIVED" },
    dueDate: { gte: w.startDate, lt: w.endDate },
    invoice: { status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
  };
  const months = monthWindows(w);
  const [payments, billedPrincipal, billedLate, feeHeads] = await Promise.all([
    db.payment.findMany({
      where: { status: { not: "FAILED" }, receivedAt: { gte: w.start, lt: w.end } },
      select: {
        method: true,
        receivedAt: true,
        amountPaise: true,
        refundedPaise: true,
        order: { select: { purpose: true } },
        allocations: { select: { invoiceId: true, amountPaise: true } },
      },
    }),
    db.instalment.groupBy({ by: ["invoiceId"], where: billedWhere, _sum: { amountPaise: true } }),
    db.instalment.groupBy({
      by: ["invoiceId"],
      where: { ...billedWhere, lateFeeWaived: false },
      _sum: { lateFeePaise: true },
    }),
    db.feeHead.findMany({ select: { code: true, name: true } }),
  ]);
  const summary = summariseReceipts(
    payments.map((p) => ({
      method: p.method,
      receivedAt: p.receivedAt,
      amountPaise: p.amountPaise,
      refundedPaise: p.refundedPaise,
      orderPurpose: p.order?.purpose ?? null,
      allocations: p.allocations,
    })),
    months,
  );
  const allocated = summary.allocatedByInvoice;
  const billed = new Map<string, number>();
  for (const b of billedPrincipal) billed.set(b.invoiceId, n0(b._sum.amountPaise));
  for (const b of billedLate)
    billed.set(b.invoiceId, (billed.get(b.invoiceId) ?? 0) + n0(b._sum.lateFeePaise));

  const invoiceIds = [...new Set([...allocated.keys(), ...billed.keys()])];
  const [invoices, lines] = await Promise.all([
    db.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: { id: true, student: { select: { class: { select: { id: true, name: true, order: true } } } } },
    }),
    db.invoiceLine.findMany({
      where: { invoiceId: { in: [...allocated.keys()] }, kind: "CHARGE", amountPaise: { gt: 0 } },
      select: { invoiceId: true, feeHeadCode: true, amountPaise: true },
    }),
  ]);

  const { gross, refunded, receipts } = summary.fee;
  const net = gross - refunded;
  const billedTotal = sumOf([...billed.values()]);
  const walletCredit = summary.walletCredit;
  const otherKinds = Object.keys(OTHER_LABEL) as (keyof typeof OTHER_LABEL)[];
  const otherGross = sumOf(otherKinds.map((k) => summary.other[k].gross));
  const otherRefunded = sumOf(otherKinds.map((k) => summary.other[k].refunded));
  const otherReceipts = sumOf(otherKinds.map((k) => summary.other[k].receipts));

  const byClass = new Map<string, { name: string; order: number; billed: number; collected: number }>();
  for (const inv of invoices) {
    const c = inv.student.class;
    const row = byClass.get(c.id) ?? { name: c.name, order: c.order, billed: 0, collected: 0 };
    row.billed += billed.get(inv.id) ?? 0;
    row.collected += allocated.get(inv.id) ?? 0;
    byClass.set(c.id, row);
  }

  const headNames = new Map(feeHeads.map((h) => [h.code, h.name]));
  const byHead = [...apportionToFeeHeads(allocated, lines)]
    .map(([code, paise]) => ({
      name: code === NO_FEE_HEAD ? "Other (invoice has no charge lines)" : (headNames.get(code) ?? code),
      paise,
    }))
    .filter((h) => h.paise !== 0)
    .sort((a, b) => b.paise - a.paise || a.name.localeCompare(b.name));

  const monthRows: ReportCell[][] = months.map((m, i) => {
    const { receipts: count, gross: g, refunded: r } = summary.feeByMonth[i]!;
    return [formatDate(m.start, "MMM yyyy"), count, g, r, g - r];
  });

  const classRows: ReportCell[][] = [...byClass.values()]
    .filter((c) => c.billed !== 0 || c.collected !== 0)
    .sort((a, b) => a.order - b.order)
    .map((c) => [c.name, c.billed, c.collected, ratioBp(c.collected, c.billed)]);
  if (walletCredit > 0) classRows.push([WALLET_CREDIT, null, walletCredit, null]);

  const headRows: ReportCell[][] = byHead.map((h) => [h.name, h.paise, ratioBp(h.paise, gross)]);
  if (walletCredit > 0) headRows.push([WALLET_CREDIT, walletCredit, ratioBp(walletCredit, gross)]);

  const methodRows: ReportCell[][] = [...summary.feeByMethod]
    .sort(([am, a], [bm, b]) => b.gross - a.gross || am.localeCompare(bm))
    .map(([method, t]) => [METHOD_LABEL[method], t.receipts, t.gross, t.refunded, t.gross - t.refunded]);

  const otherRows: ReportCell[][] = otherKinds
    .filter((k) => summary.other[k].receipts > 0)
    .map((k) => {
      const t = summary.other[k];
      return [OTHER_LABEL[k], t.receipts, t.gross, t.refunded, t.gross - t.refunded];
    });

  const tables: ReportTable[] = [
    {
      id: "by-month",
      title: "Collected by month",
      caption:
        "Fee receipts by the IST month they were received; refunds shown separately and netted in the last column.",
      columns: [
        col("month", "Month"),
        col("receipts", "Receipts", "count"),
        col("collected", "Collected", "inr"),
        col("refunded", "Refunded", "inr"),
        col("net", "Net collected", "inr"),
      ],
      rows: monthRows,
      totals: ["Total", receipts, gross, refunded, net],
    },
    {
      id: "by-class",
      title: "Billed and collected by class",
      caption:
        "Fee receipts allocated to invoices, before refunds, by the pupil's current class. Overpayments credited to a wallet are on their own row.",
      columns: [
        col("class", "Class"),
        col("billed", "Billed", "inr"),
        col("collected", "Collected", "inr"),
        col("rate", "Collected ÷ billed", "percent"),
      ],
      rows: classRows,
      totals: ["Total", billedTotal, gross, ratioBp(gross, billedTotal)],
    },
    {
      id: "by-head",
      title: "Collected by fee head",
      caption:
        "Each fee receipt is spread over its invoice's charge lines in proportion to their amounts. Overpayments credited to a wallet are on their own row.",
      columns: [
        col("head", "Fee head"),
        col("collected", "Collected", "inr"),
        col("share", "Share", "percent"),
      ],
      rows: headRows,
      totals: ["Total", gross, gross > 0 ? 10_000 : null],
    },
    {
      id: "by-method",
      title: "Collected by payment method",
      caption: "Fee receipts only.",
      columns: [
        col("method", "Method"),
        col("receipts", "Receipts", "count"),
        col("collected", "Collected", "inr"),
        col("refunded", "Refunded", "inr"),
        col("net", "Net collected", "inr"),
      ],
      rows: methodRows,
      totals: ["Total", receipts, gross, refunded, net],
    },
    {
      id: "other-receipts",
      title: "Other receipts (not fees)",
      caption:
        "Registration fees, pocket-money top-ups and any payment not applied to an invoice. Left out of every fee figure above.",
      columns: [
        col("kind", "Receipt"),
        col("receipts", "Receipts", "count"),
        col("received", "Received", "inr"),
        col("refunded", "Refunded", "inr"),
        col("net", "Net received", "inr"),
      ],
      rows: otherRows,
      totals: ["Total", otherReceipts, otherGross, otherRefunded, otherGross - otherRefunded],
    },
  ];

  const rate = ratioBp(net, billedTotal);
  return {
    period: w.label,
    headline: { value: inr(net), label: `Net fees collected, ${w.year.name}` },
    kpis: [
      {
        label: "Billed",
        value: inr(billedTotal),
        sub: `${formatINR(billedTotal)} falling due in the period`,
      },
      {
        label: "Collected",
        value: inr(gross),
        sub: `${plural(receipts, "fee receipt")} · ${formatINR(gross)}`,
      },
      { label: "Refunded", value: inr(refunded), sub: formatINR(refunded) },
      {
        label: "Net collected",
        value: inr(net),
        sub: rate === null ? formatINR(net) : `${formatBp(rate)} of billed · ${formatINR(net)}`,
      },
    ],
    tables,
    notes: [
      "Billed is every instalment falling due in the period, late fees included and waived instalments left out. Collected is every fee receipt received in it, so families paying ahead can lift the ratio above 100%.",
      "Fee receipts are payments applied to invoices or instalments, with any overpayment credited to the pupil's wallet. Registration fees, pocket-money top-ups and payments not applied to an invoice are not fees; they are listed under Other receipts and left out of every figure above.",
      "Failed payments are excluded. Class and fee head figures are before refunds; refunds are netted on the month and method tables.",
      "From and To narrow the period within the academic year.",
    ],
  };
}

/* ───────────────────────────── Outstanding ───────────────────────────── */

async function outstanding({ w, now }: Ctx): Promise<Body> {
  const today = istDateOnly(now);
  const instalments = await db.instalment.findMany({
    where: {
      status: { notIn: ["PAID", "WAIVED"] },
      ...(w.rangeDateOnly ? { dueDate: w.rangeDateOnly } : {}),
      invoice: { yearId: w.year.id, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
    },
    select: {
      dueDate: true,
      amountPaise: true,
      lateFeePaise: true,
      lateFeeWaived: true,
      paidPaise: true,
      invoice: {
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              class: { select: { id: true, name: true, order: true } },
              guardians: {
                where: { isPrimary: true },
                take: 1,
                select: { guardian: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });
  const rows: OutstandingRow[] = instalments.map((i) => {
    const s = i.invoice.student;
    const guardian = s.guardians[0]?.guardian;
    return {
      dueDate: i.dueDate,
      amountPaise: i.amountPaise,
      lateFeePaise: i.lateFeePaise,
      lateFeeWaived: i.lateFeeWaived,
      paidPaise: i.paidPaise,
      studentId: s.id,
      classId: s.class.id,
      className: s.class.name,
      classOrder: s.class.order,
      familyKey: guardian ? `guardian:${guardian.id}` : `student:${s.id}`,
      familyName: guardian ? guardian.name : `${s.firstName} ${s.lastName} (no guardian on record)`,
    };
  });
  const sum = summariseOutstanding(rows, today);
  const tables: ReportTable[] = [
    {
      id: "ageing",
      title: "Outstanding by age",
      caption: "Days past the IST due date, as at today. An instalment due today is not yet due.",
      columns: [
        col("bucket", "Age"),
        col("instalments", "Instalments", "count"),
        col("principal", "Principal", "inr"),
        col("lateFee", "Late fees", "inr"),
        col("outstanding", "Outstanding", "inr"),
        col("share", "Share", "percent"),
      ],
      rows: sum.buckets.map((b) => [
        b.label,
        b.instalments,
        b.principal,
        b.lateFee,
        b.total,
        ratioBp(b.total, sum.total.total),
      ]),
      totals: [
        "Total",
        sum.instalments,
        sum.total.principal,
        sum.total.lateFee,
        sum.total.total,
        sum.total.total > 0 ? 10_000 : null,
      ],
    },
    {
      id: "by-class",
      title: "Outstanding by class",
      caption: "Principal plus unwaived late fees, with the outstanding balance in each age band.",
      columns: [
        col("class", "Class"),
        col("pupils", "Pupils", "count"),
        col("principal", "Principal", "inr"),
        col("lateFee", "Late fees", "inr"),
        col("outstanding", "Outstanding", "inr"),
        ...AGEING_BUCKETS.map((b) => col(b.key, b.label, "inr")),
      ],
      rows: sum.classes.map((c) => [
        c.name,
        c.pupils,
        c.principal,
        c.lateFee,
        c.total,
        ...AGEING_BUCKETS.map((b) => c.byBucket[b.key]),
      ]),
      totals: [
        "Total",
        sum.pupils,
        sum.total.principal,
        sum.total.lateFee,
        sum.total.total,
        ...sum.buckets.map((b) => b.total),
      ],
    },
    {
      id: "top-families",
      title: "Top 15 families by balance",
      caption: "Families are grouped by each pupil's primary guardian, so siblings add up.",
      columns: [
        col("family", "Family (primary guardian)"),
        col("pupils", "Pupils", "count"),
        col("principal", "Principal", "inr"),
        col("lateFee", "Late fees", "inr"),
        col("balance", "Balance", "inr"),
        col("overdue", "Of which overdue", "inr"),
        col("oldest", "Oldest overdue", "days"),
      ],
      rows: sum.topFamilies.map((f) => [
        f.name,
        f.pupils,
        f.principal,
        f.lateFee,
        f.total,
        f.overdue,
        f.oldestDays > 0 ? f.oldestDays : null,
      ]),
    },
  ];
  return {
    period: `${w.year.name} invoices · as at ${formatDate(now)}${
      w.range.from || w.range.to ? ` · due ${dayLabel(w.range.from)} to ${dayLabel(w.range.to)}` : ""
    }`,
    headline: { value: inr(sum.total.total), label: `Outstanding, ${w.year.name}` },
    kpis: [
      {
        label: "Outstanding",
        value: inr(sum.total.total),
        sub: `${formatINR(sum.total.total)} across ${plural(sum.instalments, "instalment")}`,
      },
      { label: "Overdue", value: inr(sum.overdue), sub: formatINR(sum.overdue) },
      {
        label: "Late fees",
        value: inr(sum.total.lateFee),
        sub: `${formatINR(sum.total.lateFee)} unwaived`,
      },
      {
        label: "Families owing",
        value: sum.families.toLocaleString("en-IN"),
        sub: plural(sum.pupils, "pupil"),
      },
    ],
    tables,
    notes: [
      "Outstanding is principal plus unwaived late fees, less what has been paid. Void, waived and draft invoices are left out.",
      "From and To narrow the instalments by their due date; without them every unpaid instalment of the year is counted.",
    ],
  };
}

/* ───────────────────────────── Admissions funnel ───────────────────────────── */

async function funnel({ w }: Ctx): Promise<Body> {
  const created: Prisma.LeadWhereInput = { mergedIntoId: null, createdAt: { gte: w.start, lt: w.end } };
  const levels: FunnelLevel[] = [0, 1, 2, 3, 4, 5];
  const appWindow: Prisma.ApplicationWhereInput = { createdAt: { gte: w.start, lt: w.end } };
  const [counts, events, linked, unlinked] = await Promise.all([
    Promise.all(levels.map((l) => db.lead.count({ where: { AND: [created, reachedWhere(l)] } }))),
    db.applicationEvent.findMany({
      where: { application: appWindow },
      select: { applicationId: true, toStage: true, createdAt: true },
    }),
    db.application.findMany({
      where: { ...appWindow, leadId: { not: null } },
      select: { createdAt: true, lead: { select: { createdAt: true } } },
    }),
    db.application.count({ where: { ...appWindow, leadId: null, stage: { not: "DRAFT" } } }),
  ]);
  const rows = funnelRows(counts);
  const byStage = stageDurations(events);
  const enquiryToRegistration = linked
    .filter((a): a is typeof a & { lead: { createdAt: Date } } => a.lead !== null)
    .map((a) => Math.max(0, (a.createdAt.getTime() - a.lead.createdAt.getTime()) / 86_400_000));
  const stageRows: ReportCell[][] = [
    ["Enquiry to registration", enquiryToRegistration.length, medianCell(enquiryToRegistration)],
    ...PIPELINE.filter((s) => s !== "ADMITTED").map((s: ApplicationStage): ReportCell[] => {
      const days = byStage.get(s) ?? [];
      return [`${STAGE_LABEL[s]} (time spent)`, days.length, medianCell(days)];
    }),
  ];
  const admitted = rows[5]!;
  const applied = rows[3]!;
  const offered = rows[4]!;
  return {
    period: w.label,
    headline: {
      value: admitted.overallBp === null ? "—" : formatBp(admitted.overallBp),
      label: `of enquiries admitted, ${w.year.name}`,
    },
    kpis: [
      { label: "Enquiries", value: rows[0]!.count.toLocaleString("en-IN") },
      {
        label: "Applications",
        value: applied.count.toLocaleString("en-IN"),
        sub: applied.overallBp === null ? undefined : `${formatBp(applied.overallBp)} of enquiries`,
      },
      {
        label: "Offers",
        value: offered.count.toLocaleString("en-IN"),
        sub: offered.stepBp === null ? undefined : `${formatBp(offered.stepBp)} of applications`,
      },
      {
        label: "Admitted",
        value: admitted.count.toLocaleString("en-IN"),
        sub: admitted.overallBp === null ? undefined : `${formatBp(admitted.overallBp)} of enquiries`,
      },
    ],
    tables: [
      {
        id: "funnel",
        title: "Admissions funnel",
        caption:
          "Enquiries received in the period, counted at every step they reached or passed. Darker bars are further along.",
        columns: [
          col("step", "Step"),
          col("count", "Enquiries reaching it", "count"),
          col("stepRate", "Of previous step", "percent"),
          col("overallRate", "Of all enquiries", "percent"),
        ],
        rows: rows.map((r) => [r.label, r.count, r.stepBp, r.overallBp]),
      },
      {
        id: "time-in-stage",
        title: "Median days in stage",
        caption:
          "For applications created in the period: how long they spent at each stage before moving on.",
        columns: [
          col("stage", "Stage"),
          col("measured", "Applications measured", "count"),
          col("median", "Median days", "days"),
        ],
        rows: stageRows,
      },
    ],
    notes: [
      "Enquiries belong to the academic year in which they were received; From and To narrow that further.",
      "Admitted means a place was accepted: fee paid or admitted. Tours done counts checked-in visits.",
      ...(unlinked > 0
        ? [
            `${plural(unlinked, "application")} created in the period had no linked enquiry (direct registrations) and ${unlinked === 1 ? "is" : "are"} not in the funnel.`,
          ]
        : []),
      "Merged duplicate enquiries are counted once.",
    ],
  };
}

function medianCell(days: number[]): number | null {
  const m = median(days);
  return m === null ? null : roundDays(m);
}

/* ───────────────────────────── Lead sources ───────────────────────────── */

const SOURCE_LEVELS: FunnelLevel[] = [0, 1, 3, 5];

async function sources({ w }: Ctx): Promise<Body> {
  const created: Prisma.LeadWhereInput = { mergedIntoId: null, createdAt: { gte: w.start, lt: w.end } };
  const where = (l: FunnelLevel): Prisma.LeadWhereInput => ({ AND: [created, reachedWhere(l)] });
  const [placement, campaign] = await Promise.all([
    Promise.all(SOURCE_LEVELS.map((l) => db.lead.groupBy({ by: ["source"], where: where(l), _count: true }))),
    Promise.all(
      SOURCE_LEVELS.map((l) =>
        db.lead.groupBy({ by: ["utmSource", "utmCampaign"], where: where(l), _count: true }),
      ),
    ),
  ]);
  const placementRows = mergeSourceCounts(
    placement.map((g) => g.map((r) => ({ key: r.source, count: r._count }))),
  );
  const campaignRows = mergeSourceCounts(
    campaign.map((g) => g.map((r) => ({ key: groupKey(r.utmSource, r.utmCampaign), count: r._count }))),
  );
  const numeric = [
    col("enquiries", "Enquiries", "count"),
    col("share", "Share", "percent"),
    col("tours", "Tours booked", "count"),
    col("applied", "Applications", "count"),
    col("admitted", "Admitted", "count"),
    col("toApplication", "Enquiry to application", "percent"),
    col("toAdmission", "Enquiry to admission", "percent"),
  ];
  const cells = (r: SourceRow, denominator: number): ReportCell[] => [
    r.enquiries,
    ratioBp(r.enquiries, denominator),
    r.tours,
    r.applied,
    r.admitted,
    r.enquiryToApplicationBp,
    r.enquiryToAdmissionBp,
  ];
  const totalOf = (rows: SourceRow[]) => ({
    enquiries: sumOf(rows.map((r) => r.enquiries)),
    tours: sumOf(rows.map((r) => r.tours)),
    applied: sumOf(rows.map((r) => r.applied)),
    admitted: sumOf(rows.map((r) => r.admitted)),
  });
  const totalCells = (rows: SourceRow[]): ReportCell[] => {
    const t = totalOf(rows);
    return [
      t.enquiries,
      t.enquiries > 0 ? 10_000 : null,
      t.tours,
      t.applied,
      t.admitted,
      ratioBp(t.applied, t.enquiries),
      ratioBp(t.admitted, t.enquiries),
    ];
  };
  const overall = totalOf(placementRows);
  const toAdmission = ratioBp(overall.admitted, overall.enquiries);
  const top = placementRows[0];
  const topShare = top ? ratioBp(top.enquiries, overall.enquiries) : null;
  return {
    period: w.label,
    headline: {
      value: topShare === null ? "—" : formatBp(topShare),
      label: top
        ? `of enquiries from ${sourceLabel(top.key)}, ${w.year.name}`
        : `no enquiries in ${w.year.name}`,
    },
    kpis: [
      { label: "Enquiries", value: overall.enquiries.toLocaleString("en-IN") },
      {
        label: "Placements",
        value: placementRows.length.toLocaleString("en-IN"),
        sub: top ? `Top: ${sourceLabel(top.key)}` : undefined,
      },
      {
        label: "Campaigns and sources",
        value: campaignRows.length.toLocaleString("en-IN"),
        sub: "By UTM source and campaign",
      },
      {
        label: "Enquiry to admission",
        value: toAdmission === null ? "—" : formatBp(toAdmission),
        sub: plural(overall.admitted, "admission"),
      },
    ],
    tables: [
      {
        id: "by-placement",
        title: "By website placement",
        caption: "Where on the site (or off it) the enquiry was made, by first touch.",
        columns: [col("placement", "Placement"), ...numeric],
        rows: placementRows.map((r) => [sourceLabel(r.key), ...cells(r, overall.enquiries)]),
        totals: ["Total", ...totalCells(placementRows)],
      },
      {
        id: "by-campaign",
        title: "By UTM source and campaign",
        caption: "From the tracking parameters on the landing page; enquiries without any read “(none)”.",
        columns: [col("utmSource", "UTM source"), col("utmCampaign", "UTM campaign"), ...numeric],
        rows: campaignRows.map((r) => {
          const [source, name] = parseGroupKey(r.key);
          return [source!, name!, ...cells(r, overall.enquiries)];
        }),
        totals: ["Total", "", ...totalCells(campaignRows)],
      },
    ],
    notes: [
      "Enquiries belong to the academic year in which they were received; From and To narrow that further.",
      "Tours booked, applications and admissions count each enquiry at every step it reached or passed, as on the funnel report.",
    ],
  };
}

/* ───────────────────────────── Seat utilisation ───────────────────────────── */

/** Pupils on roll in a year's sections, places accepted but not yet joined, and open offers, by class. */
async function seatsForYear(yearId: string): Promise<SeatRow[]> {
  const [classes, sections, roll, apps] = await Promise.all([
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.section.groupBy({ by: ["classId"], where: { yearId }, _sum: { capacity: true } }),
    db.student.groupBy({ by: ["classId"], where: { status: "ACTIVE", section: { yearId } }, _count: true }),
    db.application.groupBy({
      by: ["classId", "stage"],
      where: { startYearId: yearId, stage: { in: ["OFFER", "FEE_PAID"] } },
      _count: true,
    }),
  ]);
  return classes.map((c) => {
    const capacity = n0(sections.find((s) => s.classId === c.id)?._sum.capacity);
    const continuing = roll.find((r) => r.classId === c.id)?._count ?? 0;
    const count = (stage: ApplicationStage) =>
      apps.find((a) => a.classId === c.id && a.stage === stage)?._count ?? 0;
    const confirmed = count("FEE_PAID");
    const offered = count("OFFER");
    return {
      key: c.id,
      label: c.name,
      capacity,
      continuing,
      confirmed,
      offered,
      free: Math.max(0, capacity - continuing - confirmed - offered),
    };
  });
}

async function seats({ w, now, years }: Ctx): Promise<Body> {
  const current =
    years.find((y) => y.isCurrent) ??
    [...years].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0]!;
  // A future year is an intake: its places are filled by pupils moving up from this year. Any other year is read
  // straight off its own roll.
  const intake = w.year.startDate > current.startDate;
  const [rows, waitlist] = await Promise.all([
    intake ? seatsForIntake(current.id, w.year.id) : seatsForYear(w.year.id),
    db.application.groupBy({
      by: ["classId"],
      where: { startYearId: w.year.id, stage: "WAITLISTED" },
      _count: true,
    }),
  ]);
  const lines = rows
    .map((r) => {
      const enrolled = r.continuing + r.confirmed;
      const pos = seatPosition(r.capacity, enrolled, r.offered);
      return {
        label: r.label,
        capacity: r.capacity,
        enrolled,
        offered: r.offered,
        waitlist: waitlist.find((x) => x.classId === r.key)?._count ?? 0,
        ...pos,
      };
    })
    .filter((l) => l.capacity > 0 || l.enrolled > 0 || l.offered > 0 || l.waitlist > 0);
  const capacity = sumOf(lines.map((l) => l.capacity));
  const enrolled = sumOf(lines.map((l) => l.enrolled));
  const offered = sumOf(lines.map((l) => l.offered));
  const left = sumOf(lines.map((l) => l.left));
  const overClasses = lines.filter((l) => l.over > 0).length;
  const waiting = sumOf(lines.map((l) => l.waitlist));
  const fill = ratioBp(enrolled, capacity);
  return {
    period: `${w.year.name} · as at ${formatDate(now)}`,
    headline: {
      value: left.toLocaleString("en-IN"),
      label: `seats left of ${capacity.toLocaleString("en-IN")}, ${w.year.name}`,
    },
    kpis: [
      {
        label: "Capacity",
        value: capacity.toLocaleString("en-IN"),
        sub: `Across ${plural(lines.length, "class", "classes")}`,
      },
      {
        label: "Enrolled",
        value: enrolled.toLocaleString("en-IN"),
        sub: fill === null ? undefined : `${formatBp(fill)} of capacity`,
      },
      {
        label: "Open offers",
        value: offered.toLocaleString("en-IN"),
        sub: `${plural(waiting, "child", "children")} on the waitlist`,
      },
      {
        label: "Seats left",
        value: left.toLocaleString("en-IN"),
        sub: overClasses
          ? `${plural(overClasses, "class", "classes")} over capacity`
          : "No class over capacity",
        status: overClasses ? "critical" : undefined,
      },
    ],
    tables: [
      {
        id: "by-class",
        title: "Seats by class",
        caption: intake
          ? `Places for the ${w.year.name} intake: pupils moving up from ${current.name}, places accepted, offers still open and the waitlist.`
          : `Pupils on the ${w.year.name} roll, places accepted but not yet joined, offers still open and the waitlist.`,
        columns: [
          col("class", "Class"),
          col("capacity", "Capacity", "count"),
          col("enrolled", "Enrolled", "count"),
          col("offers", "Open offers", "count"),
          col("waitlist", "Waitlist", "count"),
          col("left", "Seats left", "count"),
          col("status", "Status"),
        ],
        rows: lines.map((l) => [l.label, l.capacity, l.enrolled, l.offered, l.waitlist, l.left, l.status]),
        totals: [
          "Total",
          capacity,
          enrolled,
          offered,
          waiting,
          left,
          overClasses ? `${overClasses} over` : "",
        ],
      },
    ],
    notes: [
      "Seats left is capacity minus enrolled pupils minus open offers, since accepting an offer fills a seat. A negative figure means the class is over-subscribed.",
    ],
  };
}

/* ───────────────────────────── Entry points ───────────────────────────── */

const BUILDERS: Record<ReportSlug, (ctx: Ctx) => Promise<Body>> = {
  collections,
  outstanding,
  funnel,
  sources,
  seats,
};

/** Every academic year, newest first. Empty on a fresh database. */
const loadYears = (): Promise<YearRef[]> =>
  db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true },
  });

/** The one error for "reports need an academic year": the export route answers 409 and pages show an empty state. */
export const noAcademicYear = () =>
  new ApiError(409, "NO_ACADEMIC_YEAR", "Set up an academic year before running reports");

export const isNoAcademicYear = (e: unknown): e is ApiError =>
  e instanceof ApiError && e.code === "NO_ACADEMIC_YEAR";

async function build(
  slug: ReportSlug,
  raw: ReportFilter,
  now: Date,
  years: YearRef[],
): Promise<ReportResult> {
  const filter = reportFilterSchema.parse(raw);
  if (years.length === 0) throw noAcademicYear();
  const w = resolveWindow(filter, years);
  const body = await BUILDERS[slug]({ w, now, years });
  return {
    slug,
    title: REPORT_META[slug].title,
    description: REPORT_META[slug].description,
    filter: { year: w.year.name, from: w.range.from, to: w.range.to },
    years: years.map((y) => y.name),
    generatedAt: now,
    ...body,
  };
}

/**
 * One report for the page. Needs `reports:read` and the permission the report's data needs (collections:
 * `payments:read`, outstanding: `fees:read`, funnel: `applications:read`, sources: `leads:read`, seats:
 * `academics:read`). Throws a 409 `NO_ACADEMIC_YEAR` when no year exists.
 */
export async function runReport(
  actor: Actor,
  slug: ReportSlug,
  filter: ReportFilter,
  now = new Date(),
): Promise<ReportResult> {
  assertCan(actor.role, "reports:read");
  assertCan(actor.role, REPORT_META[slug].permission);
  return build(slug, filter, now, await loadYears());
}

export type HubCard = {
  slug: ReportSlug;
  title: string;
  description: string;
  headline: ReportResult["headline"];
};

export type Hub =
  /** The role may view reports, but none whose data it is allowed to see. */
  { status: "none-allowed" } | { status: "no-year" } | { status: "ready"; year: string; cards: HubCard[] };

/** The reports hub: the reports this role may open, each with its headline number for the current academic year. */
export async function reportHub(actor: Actor, now = new Date()): Promise<Hub> {
  assertCan(actor.role, "reports:read");
  const slugs = reportsFor(actor.role);
  if (slugs.length === 0) return { status: "none-allowed" };
  const years = await loadYears();
  if (years.length === 0) return { status: "no-year" };
  const results = await Promise.all(slugs.map((slug) => build(slug, {}, now, years)));
  return {
    status: "ready",
    year: results[0]!.filter.year,
    cards: results.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description,
      headline: r.headline,
    })),
  };
}

export type ExportFormat = "csv" | "xlsx";
export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReportFile = { filename: string; contentType: string } & (
  { format: "csv"; body: string } | { format: "xlsx"; body: Uint8Array<ArrayBuffer> }
);

/**
 * A report as a download. CSV carries one table (`tableId`, default the first); XLSX carries every table, one
 * sheet each. Needs `reports:export`, and every download is audited with the filter it used.
 */
export async function exportReport(
  actor: Actor,
  slug: ReportSlug,
  filter: ReportFilter,
  format: ExportFormat,
  tableId?: string,
  now = new Date(),
): Promise<ReportFile> {
  assertCan(actor.role, "reports:export");
  assertCan(actor.role, REPORT_META[slug].permission);
  const report = await build(slug, filter, now, await loadYears());
  const stamp = `${report.filter.year}-${formatDate(now, "yyyyMMdd")}`;
  let file: ReportFile;
  let rows: number;
  let tableName: string;
  if (format === "csv") {
    const table = tableId ? report.tables.find((t) => t.id === tableId) : report.tables[0];
    if (!table) throw new ApiError(404, "NOT_FOUND", `This report has no table “${tableId}”`);
    rows = table.rows.length;
    tableName = table.id;
    file = {
      format,
      filename: `aurelia-${slug}-${stamp}${tableId ? `-${table.id}` : ""}.csv`,
      contentType: CSV_CONTENT_TYPE,
      body: reportCsv(table),
    };
  } else {
    rows = report.tables.reduce((n, t) => n + t.rows.length, 0);
    tableName = "all";
    file = {
      format,
      filename: `aurelia-${slug}-${stamp}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
      body: await buildWorkbook({
        title: report.title,
        subtitle: report.period,
        generatedAt: now,
        tables: report.tables,
      }),
    };
  }
  await audit({
    actor,
    action: "report.export",
    entity: "Report",
    entityId: slug,
    after: { format, table: tableName, filter: report.filter, rows, generatedAt: formatDateTime(now) },
    reason: `${format.toUpperCase()} export of the ${report.title} report`,
  });
  return file;
}
