import { describe, expect, it } from "vitest";
import { loadWorkbook } from "./reports.fixtures";
import { csvResponse } from "@/lib/crm/csv";
import { toPaise } from "@/lib/money";
import { ageingBucket, daysPastDue, outstandingParts } from "@/lib/reports/ageing";
import { capacityRows, funnelBars, moneyBars, moneyColumns } from "@/lib/reports/chart-data";
import { apportionToFeeHeads, NO_FEE_HEAD } from "@/lib/reports/collections";
import { csvField, defuseFormula, reportCsv } from "@/lib/reports/csv";
import {
  addDays,
  lenientFilter,
  monthWindows,
  reportFilterSchema,
  resolveWindow,
  type YearRef,
} from "@/lib/reports/filter";
import {
  funnelRows,
  median,
  reachedWhere,
  roundDays,
  stageDurations,
  type StageEvent,
} from "@/lib/reports/funnel";
import { exportHref } from "@/lib/reports/links";
import { summariseOutstanding, type OutstandingRow } from "@/lib/reports/outstanding";
import { seatPosition } from "@/lib/reports/seats";
import { groupKey, mergeSourceCounts, parseGroupKey } from "@/lib/reports/sources";
import {
  col,
  csvHeader,
  formatBp,
  formatCell,
  paiseToRupees,
  ratioBp,
  type ReportTable,
} from "@/lib/reports/table";
import { buildWorkbook, INR_NUMBER_FORMAT, XLSX_HEADER_ROW, xlsxValue } from "@/lib/reports/xlsx";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const YEARS: YearRef[] = [
  { id: "y25", name: "2025-26", startDate: utc(2025, 4, 1), endDate: utc(2026, 3, 31), isCurrent: false },
  { id: "y26", name: "2026-27", startDate: utc(2026, 4, 1), endDate: utc(2027, 3, 31), isCurrent: true },
  { id: "y27", name: "2027-28", startDate: utc(2027, 4, 1), endDate: utc(2028, 3, 31), isCurrent: false },
];

describe("ageing", () => {
  it("buckets by whole days past the due date, with due-today still not yet due", () => {
    const cases: [number, string][] = [
      [-12, "current"],
      [0, "current"],
      [1, "d1_30"],
      [30, "d1_30"],
      [31, "d31_60"],
      [60, "d31_60"],
      [61, "d61_90"],
      [90, "d61_90"],
      [91, "d90_plus"],
      [400, "d90_plus"],
    ];
    for (const [days, bucket] of cases) expect(ageingBucket(days), `${days} days`).toBe(bucket);
  });

  it("counts days between date-only values stored as UTC midnight", () => {
    expect(daysPastDue(utc(2026, 9, 1), utc(2026, 10, 2))).toBe(31);
    expect(daysPastDue(utc(2026, 10, 2), utc(2026, 10, 2))).toBe(0);
    expect(daysPastDue(utc(2026, 10, 9), utc(2026, 10, 2))).toBe(-7);
  });

  it("splits what is owed into principal and late fee that always add up", () => {
    const base = {
      dueDate: utc(2026, 9, 1),
      amountPaise: 100_000,
      lateFeePaise: 5_000,
      lateFeeWaived: false,
    };
    expect(outstandingParts({ ...base, paidPaise: 0 })).toEqual({
      principal: 100_000,
      lateFee: 5_000,
      total: 105_000,
    });
    expect(outstandingParts({ ...base, paidPaise: 40_000 })).toEqual({
      principal: 60_000,
      lateFee: 5_000,
      total: 65_000,
    });
    // principal fully paid, part of the late fee paid
    expect(outstandingParts({ ...base, paidPaise: 102_000 })).toEqual({
      principal: 0,
      lateFee: 3_000,
      total: 3_000,
    });
    expect(outstandingParts({ ...base, lateFeeWaived: true, paidPaise: 0 })).toEqual({
      principal: 100_000,
      lateFee: 0,
      total: 100_000,
    });
  });
});

describe("outstanding summary", () => {
  const today = utc(2026, 10, 2);
  const row = (
    o: Partial<OutstandingRow> & Pick<OutstandingRow, "studentId" | "dueDate">,
  ): OutstandingRow => ({
    amountPaise: 100_000,
    lateFeePaise: 0,
    lateFeeWaived: false,
    paidPaise: 0,
    classId: "c7",
    className: "Year 7",
    classOrder: 9,
    familyKey: `f-${o.studentId}`,
    familyName: `Family ${o.studentId}`,
    ...o,
  });
  const rows: OutstandingRow[] = [
    row({ studentId: "a", dueDate: utc(2026, 10, 20) }), // not yet due
    row({ studentId: "b", dueDate: utc(2026, 9, 20), lateFeePaise: 2_000 }), // 12 days
    row({ studentId: "b", dueDate: utc(2026, 7, 1), familyKey: "f-b", familyName: "Family b" }), // 93 days, sibling-less same family
    row({
      studentId: "c",
      dueDate: utc(2026, 8, 1),
      classId: "c8",
      className: "Year 8",
      classOrder: 10,
      paidPaise: 100_000,
    }), // paid up
  ];

  it("ages instalments, rolls them up by class and family, and ignores settled ones", () => {
    const s = summariseOutstanding(rows, today);
    expect(s.instalments).toBe(3);
    expect(s.pupils).toBe(2);
    expect(s.total).toEqual({ principal: 300_000, lateFee: 2_000, total: 302_000 });
    expect(s.overdue).toBe(202_000);
    expect(Object.fromEntries(s.buckets.map((b) => [b.key, b.total]))).toEqual({
      current: 100_000,
      d1_30: 102_000,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 100_000,
    });
    expect(s.classes).toHaveLength(1);
    expect(s.classes[0]!.byBucket.d90_plus).toBe(100_000);
    expect(s.classes[0]!.pupils).toBe(2);
    expect(s.topFamilies.map((f) => [f.name, f.total, f.overdue, f.oldestDays])).toEqual([
      ["Family b", 202_000, 202_000, 93],
      ["Family a", 100_000, 0, 0],
    ]);
    expect(s.total.total).toBe(s.buckets.reduce((n, b) => n + b.total, 0));
  });

  it("keeps only the top N families, biggest balance first", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row({ studentId: `s${i}`, dueDate: utc(2026, 9, 1), amountPaise: 1_000 * (i + 1) }),
    );
    const s = summariseOutstanding(many, today, 15);
    expect(s.families).toBe(20);
    expect(s.topFamilies).toHaveLength(15);
    expect(s.topFamilies[0]!.total).toBe(20_000);
    expect(s.topFamilies.at(-1)!.total).toBe(6_000);
  });
});

describe("funnel", () => {
  it("computes step and overall conversion in basis points", () => {
    const rows = funnelRows([200, 120, 90, 60, 30, 15]);
    expect(rows.map((r) => r.count)).toEqual([200, 120, 90, 60, 30, 15]);
    expect(rows.map((r) => r.stepBp)).toEqual([null, 6000, 7500, 6667, 5000, 5000]);
    expect(rows.map((r) => r.overallBp)).toEqual([10000, 6000, 4500, 3000, 1500, 750]);
  });

  it("never exceeds the previous step and copes with an empty funnel", () => {
    expect(funnelRows([10, 12, 5, 5, 5, 5]).map((r) => r.count)).toEqual([10, 10, 5, 5, 5, 5]);
    const empty = funnelRows([0, 0, 0, 0, 0, 0]);
    expect(empty.every((r) => r.stepBp === null && r.overallBp === null)).toBe(true);
  });

  it("nests the proof for each step so that later steps imply earlier ones", () => {
    expect(reachedWhere(0)).toEqual({});
    const proofs = (l: 1 | 2 | 3 | 4 | 5) => (reachedWhere(l) as { OR: unknown[] }).OR;
    for (const l of [1, 2, 3, 4] as const) {
      const outer = proofs(l);
      const inner = proofs((l + 1) as 2 | 3 | 4 | 5);
      expect(outer.length).toBeGreaterThan(inner.length);
      for (const p of inner) expect(outer).toContainEqual(p);
    }
    expect(proofs(5)).toContainEqual({ status: "ADMITTED" });
    expect(proofs(1)).toContainEqual({ bookings: { some: { status: { not: "CANCELLED" } } } });
    // a draft application is not an application
    expect(proofs(3)).toContainEqual({ applications: { some: { stage: { not: "DRAFT" } } } });
  });

  it("measures days in each stage from the next stage change and ignores the stage still open", () => {
    const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 5, day, hour));
    const events: StageEvent[] = [
      { applicationId: "a", toStage: "REGISTERED", createdAt: at(1) },
      { applicationId: "a", toStage: "DOCUMENTS", createdAt: at(3) },
      { applicationId: "a", toStage: "ASSESSMENT", createdAt: at(8, 12) },
      { applicationId: "b", toStage: "DOCUMENTS", createdAt: at(10) },
      { applicationId: "b", toStage: "ASSESSMENT", createdAt: at(11) },
      // out of order on purpose
      { applicationId: "b", toStage: "REGISTERED", createdAt: at(9) },
    ];
    const d = stageDurations(events);
    expect(d.get("REGISTERED")).toEqual([2, 1]);
    expect(d.get("DOCUMENTS")).toEqual([5.5, 1]);
    expect(d.has("ASSESSMENT")).toBe(false);
    expect(median(d.get("DOCUMENTS")!)).toBe(3.25);
    expect(roundDays(3.25)).toBe(3.3);
  });

  it("takes medians of odd, even and empty sets", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe("report window and IST months", () => {
  it("defaults to the current year, falling back by name and then to the latest", () => {
    const w = resolveWindow({}, YEARS);
    expect(w.year.name).toBe("2026-27");
    expect(w.fromDay).toBe("2026-04-01");
    expect(w.toDay).toBe("2027-03-31");
    expect(resolveWindow({ year: "2025-26" }, YEARS).year.id).toBe("y25");
    expect(resolveWindow({ year: "1999-00" }, YEARS).year.id).toBe("y26");
    expect(
      resolveWindow(
        {},
        YEARS.map((y) => ({ ...y, isCurrent: false })),
      ).year.id,
    ).toBe("y27");
  });

  it("starts and ends the window at IST midnight", () => {
    const w = resolveWindow({}, YEARS);
    expect(w.start.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(w.end.toISOString()).toBe("2027-03-31T18:30:00.000Z");
    expect(w.startDate.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(w.endDate.toISOString()).toBe("2027-04-01T00:00:00.000Z");
    expect(w.rangeDateOnly).toBeUndefined();
  });

  it("narrows the year with a typed range and never widens it", () => {
    const w = resolveWindow({ from: "2026-06-10", to: "2026-06-20" }, YEARS);
    expect([w.fromDay, w.toDay]).toEqual(["2026-06-10", "2026-06-20"]);
    expect(w.rangeDateOnly).toEqual({ gte: utc(2026, 6, 10), lt: utc(2026, 6, 21) });
    const wide = resolveWindow({ from: "2020-01-01", to: "2040-01-01" }, YEARS);
    expect([wide.fromDay, wide.toDay]).toEqual(["2026-04-01", "2027-03-31"]);
    const outside = resolveWindow({ from: "2028-01-01" }, YEARS);
    expect(outside.empty).toBe(true);
    expect(outside.end.getTime()).toBe(outside.start.getTime());
    expect(monthWindows(outside)).toEqual([]);
  });

  it("buckets receipts into IST months, so late evening UTC lands in the next IST month", () => {
    const months = monthWindows(resolveWindow({}, YEARS));
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ key: "2026-04", label: "Apr", longLabel: "April 2026" });
    expect(months[11]!.key).toBe("2027-03");
    const inMonth = (iso: string) => {
      const t = new Date(iso).getTime();
      return months.find((m) => t >= m.start.getTime() && t < m.end.getTime())?.key;
    };
    // 23:50 IST on 30 April, and 00:10 IST on 1 May
    expect(inMonth("2026-04-30T18:20:00Z")).toBe("2026-04");
    expect(inMonth("2026-04-30T18:40:00Z")).toBe("2026-05");
    // 00:10 IST on 1 April is still 31 March in UTC, but belongs to the first month
    expect(inMonth("2026-03-31T18:40:00Z")).toBe("2026-04");
    // the buckets tile the window exactly
    for (let i = 1; i < months.length; i++)
      expect(months[i]!.start.getTime()).toBe(months[i - 1]!.end.getTime());
    expect(months[0]!.start.getTime()).toBe(resolveWindow({}, YEARS).start.getTime());
    expect(months[11]!.end.getTime()).toBe(resolveWindow({}, YEARS).end.getTime());
  });

  it("clips the first and last month to a narrowed range", () => {
    const w = resolveWindow({ from: "2026-05-15", to: "2026-07-10" }, YEARS);
    const months = monthWindows(w);
    expect(months.map((m) => m.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(months[0]!.start.toISOString()).toBe("2026-05-14T18:30:00.000Z");
    expect(months[2]!.end.toISOString()).toBe("2026-07-10T18:30:00.000Z");
  });

  it("does day arithmetic across month and leap-year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("report filter", () => {
  it("accepts clean input, treats blanks as unset and rejects bad dates and reversed ranges", () => {
    expect(reportFilterSchema.parse({ year: "2026-27", from: "2026-06-01", to: "2026-06-30" })).toEqual({
      year: "2026-27",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(reportFilterSchema.parse({ from: "", to: "", year: "" })).toEqual({});
    expect(reportFilterSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(reportFilterSchema.safeParse({ from: "01/06/2026" }).success).toBe(false);
    expect(reportFilterSchema.safeParse({ from: "2026-07-01", to: "2026-06-01" }).success).toBe(false);
  });

  it("ignores bad parts of a hand-edited URL and swaps a reversed range", () => {
    expect(lenientFilter({ year: "2026-27", from: "nonsense", to: ["2026-09-01", "x"] })).toEqual({
      year: "2026-27",
      to: "2026-09-01",
    });
    expect(lenientFilter({ from: "2026-09-01", to: "2026-06-01" })).toEqual({
      from: "2026-06-01",
      to: "2026-09-01",
    });
    expect(lenientFilter({})).toEqual({});
  });
});

describe("money in tables and exports", () => {
  it("turns paise into spreadsheet rupees exactly", () => {
    expect(paiseToRupees(12_345)).toBe(123.45);
    expect(paiseToRupees(1)).toBe(0.01);
    expect(paiseToRupees(-5)).toBe(-0.05);
    expect(paiseToRupees(0)).toBe(0);
    expect(paiseToRupees(1_234_567_850)).toBe(12_345_678.5);
    for (const p of [1, 7, 29, 99, 101, 1_005, 123_456_789, 9_999_999_999]) {
      expect(toPaise(String(paiseToRupees(p))), `${p}`).toBe(p);
    }
    expect(() => paiseToRupees(1.5)).toThrow();
  });

  it("types xlsx cells: money as rupees, percentages as fractions, blanks as nothing", () => {
    expect(xlsxValue("inr", 250_050)).toBe(2500.5);
    expect(xlsxValue("percent", 1_250)).toBe(0.125);
    expect(xlsxValue("count", 42)).toBe(42);
    expect(xlsxValue("days", 3.5)).toBe(3.5);
    expect(xlsxValue("inr", null)).toBeNull();
    expect(xlsxValue("text", "Year 7")).toBe("Year 7");
  });

  it("shows cells for people", () => {
    expect(formatCell(col("a", "A", "inr"), 12_500_000)).toBe("₹1,25,000");
    expect(formatCell(col("a", "A", "inr"), -50_000)).toBe("−₹500");
    expect(formatCell(col("a", "A", "count"), 1234567)).toBe("12,34,567");
    expect(formatCell(col("a", "A", "percent"), 4_500)).toBe("45%");
    expect(formatCell(col("a", "A", "percent"), 6_667)).toBe("66.7%");
    expect(formatCell(col("a", "A", "days"), 3)).toBe("3");
    expect(formatCell(col("a", "A", "days"), 3.25)).toBe("3.3");
    expect(formatCell(col("a", "A", "inr"), null)).toBe("—");
    expect(formatBp(0)).toBe("0%");
    expect(ratioBp(1, 3)).toBe(3333);
    expect(ratioBp(2, 3)).toBe(6667);
    expect(ratioBp(5, 0)).toBeNull();
  });
});

describe("csv", () => {
  const text = col("t", "Text");
  const money = col("m", "Money", "inr");
  const count = col("n", "Count", "count");

  it("defuses anything a spreadsheet could read as a formula", () => {
    for (const bad of ["=SUM(A1)", "+1", "-1+2", "@cmd", "\tx", "\rx"])
      expect(defuseFormula(bad)).toBe(`'${bad}`);
    expect(defuseFormula("Year 7")).toBe("Year 7");
    expect(defuseFormula("a=b")).toBe("a=b");
    expect(csvField(text, '=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
  });

  it("keeps real negative numbers numeric and never prefixes them", () => {
    expect(csvField(count, -3)).toBe("-3");
    expect(csvField(money, -1_050)).toBe("-10.50");
    expect(csvField(money, 125_000)).toBe("1250.00");
    expect(csvField(money, null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField(text, "Bloom, Hall")).toBe('"Bloom, Hall"');
    expect(csvField(text, 'say "hi"')).toBe('"say ""hi"""');
    expect(csvField(text, "a\nb")).toBe('"a\nb"');
  });

  const table: ReportTable = {
    id: "t",
    title: "T",
    columns: [text, money, col("r", "Rate", "percent"), col("d", "Wait", "days"), count],
    rows: [
      ["Year 7", 250_050, 4_500, 3.25, 2],
      ["=evil", null, null, null, -1],
    ],
    totals: ["Total", 250_050, null, null, 1],
  };

  it("writes units in the header, the rows, then the totals row, with CRLF line ends", () => {
    expect(csvHeader(money)).toBe("Money (INR)");
    expect(reportCsv(table).split("\r\n")).toEqual([
      "Text,Money (INR),Rate (%),Wait (days),Count",
      "Year 7,2500.50,45.0,3.3,2",
      "'=evil,,,,-1",
      "Total,2500.50,,,1",
      "",
    ]);
  });

  it("is served with a UTF-8 byte order mark so Excel reads the rupee sign and accents", async () => {
    const res = csvResponse("x.csv", reportCsv(table));
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });
});

describe("xlsx", () => {
  const table: ReportTable = {
    id: "by-class",
    title: "Billed by class",
    columns: [
      col("class", "Class"),
      col("billed", "Billed", "inr"),
      col("rate", "Collected ÷ billed", "percent"),
      col("n", "Pupils", "count"),
    ],
    rows: [
      ["Year 7", 1_234_567_850, 8_333, 24],
      ["Year 8", 99, null, 0],
    ],
    totals: ["Total", 1_234_567_949, 8_300, 24],
  };

  it("writes real numeric cells, a frozen header, sized columns, a title row and a generated footer", async () => {
    const generatedAt = new Date("2026-10-02T09:34:00Z"); // 15:04 IST
    const bytes = await buildWorkbook({
      title: "Fee collections",
      subtitle: "2026-27 · 1 Apr 2026 – 31 Mar 2027",
      generatedAt,
      tables: [table, { ...table, id: "again", title: "Billed by class" }],
    });
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // a zip container

    const wb = await loadWorkbook(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Billed by class", "Billed by class 2"]);
    const ws = wb.getWorksheet("Billed by class")!;

    expect(ws.getCell("A1").value).toBe("Fee collections: Billed by class");
    expect(ws.getCell("A2").value).toBe("2026-27 · 1 Apr 2026 – 31 Mar 2027");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: XLSX_HEADER_ROW });

    const header = ws.getRow(XLSX_HEADER_ROW);
    expect(header.values).toEqual([undefined, "Class", "Billed", "Collected ÷ billed", "Pupils"]);

    const first = ws.getRow(XLSX_HEADER_ROW + 1);
    expect(first.getCell(1).value).toBe("Year 7");
    expect(first.getCell(2).value).toBe(12_345_678.5);
    expect(typeof first.getCell(2).value).toBe("number");
    expect(first.getCell(2).numFmt).toBe(INR_NUMBER_FORMAT);
    expect(first.getCell(3).value).toBe(0.8333);
    expect(first.getCell(3).numFmt).toBe("0.0%");
    expect(first.getCell(4).value).toBe(24);

    const second = ws.getRow(XLSX_HEADER_ROW + 2);
    expect(second.getCell(2).value).toBe(0.99);
    expect(second.getCell(3).value).toBeNull();

    const totals = ws.getRow(XLSX_HEADER_ROW + 3);
    expect(totals.getCell(1).value).toBe("Total");
    expect(totals.getCell(1).font?.bold).toBe(true);
    expect(totals.getCell(2).value).toBe(12_345_679.49);

    expect(ws.getCell(XLSX_HEADER_ROW + 5, 1).value).toBe("Generated 2 Oct 2026, 3:04 PM IST");
    expect(ws.getColumn(2).width).toBeGreaterThanOrEqual(10);
    expect(ws.getColumn(2).width).toBeLessThanOrEqual(48);
    expect(INR_NUMBER_FORMAT).toContain("₹");
    expect(INR_NUMBER_FORMAT).toContain("#,##,##0.00");
  });

  it("makes safe unique sheet names", async () => {
    const bytes = await buildWorkbook({
      title: "R",
      subtitle: "s",
      generatedAt: new Date(),
      tables: [
        { ...table, title: "A/B: very long name that goes past thirty-one characters" },
        { ...table, title: "" },
      ],
    });
    const wb = await loadWorkbook(bytes);
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe("A B  very long name that goes p");
    expect(names[0]!.length).toBeLessThanOrEqual(31);
    expect(names[1]).toBe("Report");
  });
});

describe("fee head apportionment", () => {
  it("spreads each invoice's receipts over its charge lines and always adds up exactly", () => {
    const allocated = new Map([
      ["inv1", 100_001],
      ["inv2", 50_000],
      ["inv3", 7_777],
    ]);
    const result = apportionToFeeHeads(allocated, [
      { invoiceId: "inv1", feeHeadCode: "TUI", amountPaise: 300_000 },
      { invoiceId: "inv1", feeHeadCode: "BRD", amountPaise: 100_000 },
      { invoiceId: "inv1", feeHeadCode: "DISC", amountPaise: -50_000 }, // ignored: not a charge
      { invoiceId: "inv2", feeHeadCode: "TUI", amountPaise: 1 },
    ]);
    expect(result.get("TUI")).toBe(75_001 + 50_000);
    expect(result.get("BRD")).toBe(25_000);
    expect(result.get(NO_FEE_HEAD)).toBe(7_777);
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(100_001 + 50_000 + 7_777);
    expect(result.has("DISC")).toBe(false);
  });
});

describe("lead sources", () => {
  it("merges the four layers into rows, biggest first, with conversion", () => {
    const rows = mergeSourceCounts([
      [
        { key: "drawer", count: 10 },
        { key: "phone", count: 4 },
        { key: "contact", count: 10 },
      ],
      [{ key: "drawer", count: 6 }],
      [
        { key: "drawer", count: 4 },
        { key: "phone", count: 1 },
      ],
      [{ key: "drawer", count: 1 }],
    ]);
    expect(rows.map((r) => r.key)).toEqual(["contact", "drawer", "phone"]);
    expect(rows[1]).toMatchObject({
      enquiries: 10,
      tours: 6,
      applied: 4,
      admitted: 1,
      enquiryToApplicationBp: 4_000,
      enquiryToAdmissionBp: 1_000,
    });
    expect(rows[0]).toMatchObject({ tours: 0, applied: 0, enquiryToAdmissionBp: 0 });
  });

  it("builds compound keys that survive any characters in a campaign name", () => {
    const key = groupKey("google", 'a"b,c\n');
    expect(parseGroupKey(key)).toEqual(["google", 'a"b,c\n']);
    expect(parseGroupKey(groupKey(null, null))).toEqual(["(none)", "(none)"]);
  });
});

describe("seats", () => {
  it("counts open offers against capacity and flags over-subscription", () => {
    expect(seatPosition(40, 30, 5)).toEqual({ left: 5, over: 0, status: "Open" });
    expect(seatPosition(40, 36, 4)).toEqual({ left: 0, over: 0, status: "Full" });
    expect(seatPosition(40, 38, 5)).toEqual({ left: -3, over: 3, status: "Over by 3" });
    expect(seatPosition(0, 0, 0).status).toBe("Full");
  });
});

describe("chart data comes from the tables", () => {
  const months: ReportTable = {
    id: "by-month",
    title: "Collected by month",
    columns: [
      col("month", "Month"),
      col("receipts", "Receipts", "count"),
      col("net", "Net collected", "inr"),
    ],
    rows: [
      ["Apr 2026", 12, 12_500_000],
      ["May 2026", 0, 0],
    ],
  };

  it("makes columns, with the exact figure in the tooltip", () => {
    const data = moneyColumns(
      months,
      { label: "month", value: "net", detailCount: { key: "receipts", one: "receipt", many: "receipts" } },
      (l) => l.slice(0, 3),
    );
    expect(data[0]).toEqual({
      key: "Apr 2026",
      label: "Apr",
      value: 12_500_000,
      display: "₹1.25 L",
      detail: "Apr 2026 · 12 receipts · ₹1,25,000",
    });
    expect(data[1]!.value).toBe(0);
  });

  it("makes money bars with extras, and complains about a missing column", () => {
    const bars = moneyBars(months, { label: "month", value: "net", extras: ["receipts"] });
    expect(bars[0]).toMatchObject({
      label: "Apr 2026",
      value: 12_500_000,
      detail: "₹1,25,000 · Receipts 12",
    });
    expect(() => moneyBars(months, { label: "month", value: "nope" })).toThrow(/no column "nope"/);
  });

  it("colours funnel steps along the ordinal ramp, darker further along", () => {
    const table: ReportTable = {
      id: "funnel",
      title: "Funnel",
      columns: [
        col("step", "Step"),
        col("count", "Enquiries reaching it", "count"),
        col("stepRate", "Of previous step", "percent"),
        col("overallRate", "Of all enquiries", "percent"),
      ],
      rows: funnelRows([100, 50, 25, 10, 5, 1]).map((r) => [r.label, r.count, r.stepBp, r.overallBp]),
    };
    const bars = funnelBars(table);
    expect(bars.map((b) => b.color)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `var(--viz-ord-${n})`));
    expect(bars[1]!.display).toBe("50 · 50%");
    expect(bars[0]!.display).toBe("100");
  });

  it("reads capacity rows from the seats table", () => {
    const table: ReportTable = {
      id: "by-class",
      title: "Seats",
      columns: [
        col("class", "Class"),
        col("capacity", "Capacity", "count"),
        col("enrolled", "Enrolled", "count"),
        col("offers", "Open offers", "count"),
        col("waitlist", "Waitlist", "count"),
        col("left", "Seats left", "count"),
        col("status", "Status"),
      ],
      rows: [["Year 7", 40, 38, 5, 2, -3, "Over by 3"]],
    };
    expect(capacityRows(table)).toEqual([
      { key: "Year 7", label: "Year 7", capacity: 40, enrolled: 38, offered: 5, waitlist: 2, left: -3 },
    ]);
  });
});

describe("export links", () => {
  it("carries the filter on screen into the download", () => {
    expect(exportHref("collections", { year: "2026-27", from: null, to: null }, "csv")).toBe(
      "/api/admin/reports/collections?format=csv&year=2026-27",
    );
    expect(
      exportHref("seats", { year: "2026-27", from: "2026-06-01", to: "2026-06-30" }, "xlsx", "by-class"),
    ).toBe("/api/admin/reports/seats?format=xlsx&year=2026-27&from=2026-06-01&to=2026-06-30&table=by-class");
  });
});
