import { describe, expect, it } from "vitest";
import { matchStatement, parseAmount, parseBankCsv, parseBankDate, parseCsv } from "@/lib/reconcile";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("CSV and field parsing", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
  it("reads Indian bank date formats day-first and rejects impossible dates", () => {
    expect(parseBankDate("05/04/2026")).toEqual(d("2026-04-05"));
    expect(parseBankDate("05-04-26")).toEqual(d("2026-04-05"));
    expect(parseBankDate("2026-04-05")).toEqual(d("2026-04-05"));
    expect(parseBankDate("5 Apr 2026")).toEqual(d("2026-04-05"));
    expect(parseBankDate("05-Sept-2026")).toEqual(d("2026-09-05"));
    expect(parseBankDate("31/02/2026")).toBeNull();
    expect(parseBankDate("soon")).toBeNull();
  });
  it("parses amounts with Indian grouping into paise", () => {
    expect(parseAmount("1,23,456.70")).toBe(12_345_670);
    expect(parseAmount("₹ 500")).toBe(50_000);
    expect(parseAmount("(500.00)")).toBe(-50_000);
    expect(parseAmount("12.5")).toBe(1_250);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
  });
});

describe("bank statement import", () => {
  const csv = [
    "Account,Aurelia Hall School (sample)",
    "Statement period,01/09/2026 to 30/09/2026",
    "",
    "Txn Date,Narration,Ref No./Cheque No.,Debit,Credit,Balance",
    '12/09/2026,"NEFT-HDFC-MENON ARJUN","NEFT400037",,"1,57,380.00","10,00,000.00"',
    "13/09/2026,ELECTRICITY BILL,,45000.00,,9,55,000.00",
    "14/09/2026,CHQ DEP 004512 PATIL,004512,,94000.00,10,49,000.00",
    "not a date,,,,,",
  ].join("\n");

  it("skips the preamble, keeps credits, ignores debits and reports bad rows", () => {
    const r = parseBankCsv(csv);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toEqual({
      date: d("2026-09-12"),
      description: "NEFT-HDFC-MENON ARJUN",
      reference: "NEFT400037",
      amountPaise: 15_738_000,
    });
    expect(r.skippedDebits).toBe(1);
    expect(r.errors).toEqual(['Row 8: unreadable date "not a date"']);
  });

  it("accepts a single signed amount column", () => {
    const r = parseBankCsv("Date,Description,Amount\n2026-09-01,Fee,2500\n2026-09-02,Bank charges,-50");
    expect(r.lines.map((l) => l.amountPaise)).toEqual([250_000]);
    expect(r.skippedDebits).toBe(1);
  });

  it("explains a file it can't read", () => {
    expect(parseBankCsv("hello,world").errors[0]).toMatch(/No header row/);
  });
});

describe("matching", () => {
  const payments = [
    { id: "p1", amountPaise: 15_738_000, receivedAt: d("2026-09-11"), reference: "NEFT400037" },
    { id: "p2", amountPaise: 9_400_000, receivedAt: d("2026-09-13"), reference: "CHQ004512" },
    { id: "p3", amountPaise: 5_000_000, receivedAt: d("2026-09-20"), reference: null },
    { id: "p4", amountPaise: 5_000_000, receivedAt: d("2026-09-21"), reference: null },
    { id: "p5", amountPaise: 7_000_000, receivedAt: d("2026-09-01"), reference: null },
  ];
  const line = (date: string, amount: number, reference: string | null = null, description = "") => ({
    date: d(date),
    amountPaise: amount,
    reference,
    description,
  });

  it("matches by reference first, then by a unique amount within the date tolerance", () => {
    const m = matchStatement(
      [
        line("2026-09-12", 15_738_000, "NEFT400037"),
        line("2026-09-14", 9_400_000, "004512", "CHQ DEP 004512 PATIL"), // reference formats differ: falls to amount+date
        line("2026-09-20", 5_000_000), // two identical payments: never guess
        line("2026-09-09", 7_000_000), // 8 days away: outside tolerance
        line("2026-09-15", 12_345),
      ],
      payments,
    );
    expect(m.map((x) => [x.paymentId, x.rule])).toEqual([
      ["p1", "reference"],
      ["p2", "amount-date"],
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it("uses each payment once and needs the amount to agree even when the reference does", () => {
    const m = matchStatement(
      [
        line("2026-09-12", 15_738_000, "NEFT400037"),
        line("2026-09-12", 15_738_000, "NEFT400037"),
        line("2026-09-12", 100, "NEFT400037"),
      ],
      payments,
    );
    expect(m.map((x) => x.paymentId)).toEqual(["p1", null, null]);
  });
});
