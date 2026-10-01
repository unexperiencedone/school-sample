import { route } from "@/lib/api";
import { csvResponse } from "@/lib/crm/csv";
import { sampleStatementCsv } from "@/lib/services/reconciliation";

/** GET /api/admin/reconciliation/sample — a realistic bank statement built from recent offline payments (demo aid). */
export const GET = route(async () => csvResponse("sample-bank-statement.csv", await sampleStatementCsv()), {
  permission: "reconciliation:run",
});
