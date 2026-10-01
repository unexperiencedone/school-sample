/** Receipt numbers are sequential and gap-free per Indian financial year: AHR/2026-27/000042 */
export function formatReceiptNumber(prefix: string, financialYear: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError("Receipt sequence must be a positive integer");
  return `${prefix}/${financialYear}/${String(seq).padStart(6, "0")}`;
}

export function formatInvoiceNumber(prefix: string, academicYear: string, seq: number): string {
  return `${prefix}/${academicYear}/${String(seq).padStart(5, "0")}`;
}
