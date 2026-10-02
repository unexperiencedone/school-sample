import ExcelJS from "exceljs";
import { formatDate } from "@/lib/dates";
import {
  allRows,
  formatCell,
  paiseToRupees,
  type ColumnKind,
  type ReportCell,
  type ReportTable,
} from "./table";

/** Rupees with the rupee sign; spreadsheet apps group digits per the viewer's locale (lakh grouping in en-IN). */
export const INR_NUMBER_FORMAT = '"₹"#,##,##0.00;-"₹"#,##,##0.00';

const NUMBER_FORMAT: Record<ColumnKind, string | undefined> = {
  text: undefined,
  count: "#,##0",
  inr: INR_NUMBER_FORMAT,
  percent: "0.0%",
  days: "0.0",
};

/** The value a spreadsheet cell holds: money as exact rupees, percentages as fractions, blanks as nothing. */
export function xlsxValue(kind: ColumnKind, cell: ReportCell): string | number | null {
  if (cell === null || typeof cell === "string") return cell;
  if (kind === "inr") return paiseToRupees(cell);
  if (kind === "percent") return cell / 10_000;
  return cell;
}

export type WorkbookInput = {
  title: string;
  /** Period and filters, shown under the title on every sheet. */
  subtitle: string;
  generatedAt: Date;
  tables: ReportTable[];
};

/** Rows reserved above the data: title, subtitle, a spacer and the header; all four stay frozen. */
export const XLSX_HEADER_ROW = 4;

const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g;

function sheetName(title: string, taken: Set<string>): string {
  const base = title.replace(INVALID_SHEET_CHARS, " ").trim().slice(0, 31) || "Report";
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++)
    name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  taken.add(name.toLowerCase());
  return name;
}

/** One worksheet per table: title row, subtitle, frozen header, typed cells, sized columns, "Generated" footer. */
export async function buildWorkbook(input: WorkbookInput): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aurelia Hall CRM";
  wb.title = input.title;
  wb.created = input.generatedAt;
  const generated = `Generated ${formatDate(input.generatedAt, "d MMM yyyy, h:mm a")} IST`;
  const taken = new Set<string>();

  for (const table of input.tables) {
    const ws = wb.addWorksheet(sheetName(table.title, taken), {
      views: [{ state: "frozen", ySplit: XLSX_HEADER_ROW }],
    });
    const last = table.columns.length;

    ws.getCell(1, 1).value = `${input.title}: ${table.title}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(2, 1).value = input.subtitle;
    ws.getCell(2, 1).font = { italic: true, color: { argb: "FF555555" } };
    if (last > 1) {
      ws.mergeCells(1, 1, 1, last);
      ws.mergeCells(2, 1, 2, last);
    }

    const header = ws.getRow(XLSX_HEADER_ROW);
    table.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE7DA" } };
      cell.border = { bottom: { style: "thin" } };
      cell.alignment = {
        horizontal: c.kind === "text" ? "left" : "right",
        vertical: "middle",
        wrapText: true,
      };
    });

    const widths = table.columns.map((c) => Math.max(10, Math.min(c.label.length, 18) + 2));
    allRows(table).forEach((row, r) => {
      const isTotals = table.totals !== undefined && row === table.totals;
      const excelRow = ws.getRow(XLSX_HEADER_ROW + 1 + r);
      table.columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        const raw = row[i] ?? null;
        cell.value = xlsxValue(c.kind, raw);
        const fmt = NUMBER_FORMAT[c.kind];
        if (fmt) cell.numFmt = fmt;
        if (c.kind !== "text") cell.alignment = { horizontal: "right" };
        if (isTotals) {
          cell.font = { bold: true };
          cell.border = { top: { style: "thin" } };
        }
        widths[i] = Math.max(widths[i]!, Math.min(formatCell(c, raw).length + 2, 48));
      });
    });
    table.columns.forEach((_, i) => {
      ws.getColumn(i + 1).width = widths[i]!;
    });

    const footer = ws.getCell(XLSX_HEADER_ROW + allRows(table).length + 2, 1);
    footer.value = generated;
    footer.font = { italic: true, color: { argb: "FF555555" } };
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
