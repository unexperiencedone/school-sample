import ExcelJS from "exceljs";

type XlsxInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

/** Reads workbook bytes back with exceljs (its typings want its own Buffer interface). */
export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as XlsxInput);
  return wb;
}
