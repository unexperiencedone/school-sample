import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/crm/csv";
import { paiseToRupeeString } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { listDues, type DuesFilter } from "@/lib/services/dues";

/** GET /api/admin/dues/export — the dues view as CSV (formula-safe), audit-logged. */
export const GET = route(
  async (req, { user }) => {
    const url = new URL(req.url);
    const filter = (
      ["overdue", "upcoming", "flagged"].includes(url.searchParams.get("filter") ?? "")
        ? url.searchParams.get("filter")
        : "overdue"
    ) as DuesFilter;
    const rows = await listDues(filter, {
      classId: url.searchParams.get("class") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    await audit({
      actor: user,
      action: "dues.export",
      entity: "Instalment",
      after: { filter, rows: rows.length },
    });
    return csvResponse(
      `dues-${filter}-${formatDate(new Date(), "yyyy-MM-dd")}.csv`,
      toCsv(
        [
          "Admission no",
          "Pupil",
          "Class",
          "Invoice",
          "Instalment",
          "Due date",
          "Days overdue",
          "Principal (INR)",
          "Late fee (INR)",
          "Outstanding (INR)",
          "Flagged",
        ],
        rows.map((r) => [
          r.student.admissionNo,
          r.student.name,
          r.student.className,
          r.invoiceNumber,
          r.label,
          formatDate(r.dueDate, "yyyy-MM-dd"),
          r.daysOverdue,
          paiseToRupeeString(r.principalPaise),
          paiseToRupeeString(r.lateFeePaise),
          paiseToRupeeString(r.outstandingPaise),
          r.flagged ? "yes" : "",
        ]),
      ),
    );
  },
  { permission: "fees:read" },
);
