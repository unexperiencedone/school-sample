/**
 * Bank statement reconciliation, pure functions: parse a bank's CSV export and match its credits to payments the
 * school recorded. No I/O here, so the matching rules are unit-tested in isolation.
 */

export type StatementLine = {
  date: Date;
  description: string;
  reference: string | null;
  amountPaise: number;
};
export type ParseResult = { lines: StatementLine[]; skippedDebits: number; errors: string[] };

/**
 * RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. Blank rows are kept (as `[""]`)
 * so row numbers in error messages match the file; only the trailing newline's empty row is dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Indian bank date formats: 05/04/2026, 05-04-2026, 2026-04-05, 05-Apr-2026, 05 Apr 2026. Day first. */
export function parseBankDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utc(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return utc(year(m[3]!), +m[2]!, +m[1]!);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2]!.toLowerCase());
    if (mon >= 0) return utc(year(m[3]!), mon + 1, +m[1]!);
  }
  return null;
}
const year = (y: string) => (y.length === 2 ? 2000 + +y : +y);
function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** "1,23,456.70" / "₹ 500" / "(500.00)" → paise. Returns null for blanks and garbage. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const cleaned = s.replace(/[₹,\s()]|Rs\.?|INR/gi, "").replace(/^-/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -paise : paise;
}

const find = (header: string[], ...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));

/**
 * Reads a bank statement export. Finds the header row (banks put account details above it), then the date,
 * narration, reference and credit/debit (or signed amount) columns by name. Only credits are kept — money in.
 */
export function parseBankCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const headerAt = rows.findIndex((r) => {
    const h = r.map((c) => c.trim().toLowerCase());
    return h.some((c) => /date/.test(c)) && h.some((c) => /(credit|deposit|amount|cr\b)/.test(c));
  });
  if (headerAt < 0)
    return { lines: [], skippedDebits: 0, errors: ["No header row with a date and a credit/amount column."] };
  const header = rows[headerAt]!.map((c) => c.trim().toLowerCase());
  const iDate = find(header, /^(txn |transaction |value )?date/, /date/);
  const iDesc = find(header, /narration|description|particulars|details|remarks/);
  const iRef = find(header, /ref|cheque|chq|utr/);
  const iCredit = find(header, /credit|deposit|^cr$/);
  const iDebit = find(header, /debit|withdrawal|^dr$/);
  const iAmount = iCredit < 0 ? find(header, /amount/) : -1;
  const lines: StatementLine[] = [];
  let skippedDebits = 0;
  rows.slice(headerAt + 1).forEach((r, k) => {
    const rowNo = headerAt + k + 2;
    if (r.every((c) => c.trim() === "")) return;
    const date = parseBankDate(r[iDate] ?? "");
    if (!date) {
      if ((r[iDate] ?? "").trim()) errors.push(`Row ${rowNo}: unreadable date "${r[iDate]}"`);
      return;
    }
    let amount: number | null;
    if (iCredit >= 0) {
      amount = parseAmount(r[iCredit] ?? "");
      if (!amount && iDebit >= 0 && parseAmount(r[iDebit] ?? "")) {
        skippedDebits++;
        return;
      }
    } else amount = parseAmount(r[iAmount] ?? "");
    if (amount === null) {
      errors.push(`Row ${rowNo}: no amount`);
      return;
    }
    if (amount <= 0) {
      skippedDebits++;
      return;
    }
    lines.push({
      date,
      description: (r[iDesc] ?? "").trim().replace(/\s+/g, " "),
      reference: iRef >= 0 ? (r[iRef] ?? "").trim() || null : null,
      amountPaise: amount,
    });
  });
  return { lines, skippedDebits, errors };
}

export type Candidate = { id: string; amountPaise: number; receivedAt: Date; reference: string | null };
export type Match = { line: number; paymentId: string | null; rule: "reference" | "amount-date" | null };

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const dayDiff = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

/**
 * Matches statement credits to recorded payments, each payment used at most once:
 *  1. same amount and the payment's reference appears in the line's reference or narration;
 *  2. otherwise same amount within `toleranceDays`, only when exactly one payment fits (no guessing between twins).
 */
export function matchStatement(lines: StatementLine[], payments: Candidate[], toleranceDays = 3): Match[] {
  const used = new Set<string>();
  const result: Match[] = lines.map((_, line) => ({ line, paymentId: null, rule: null }));
  lines.forEach((l, i) => {
    const hay = norm(l.reference) + "|" + norm(l.description);
    const hit = payments.find(
      (p) =>
        !used.has(p.id) &&
        p.amountPaise === l.amountPaise &&
        norm(p.reference).length >= 4 &&
        hay.includes(norm(p.reference)),
    );
    if (hit) {
      used.add(hit.id);
      result[i] = { line: i, paymentId: hit.id, rule: "reference" };
    }
  });
  lines.forEach((l, i) => {
    if (result[i]!.paymentId) return;
    const fits = payments.filter(
      (p) =>
        !used.has(p.id) && p.amountPaise === l.amountPaise && dayDiff(p.receivedAt, l.date) <= toleranceDays,
    );
    if (fits.length === 1) {
      used.add(fits[0]!.id);
      result[i] = { line: i, paymentId: fits[0]!.id, rule: "amount-date" };
    }
  });
  return result;
}
