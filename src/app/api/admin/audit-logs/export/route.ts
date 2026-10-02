import { route } from "@/lib/api";
import { csvResponse } from "@/lib/crm/csv";
import { exportAuditCsv } from "@/lib/services/audit-viewer";

/** GET /api/admin/audit-logs/export — the filtered log as CSV (same filters as the list). Audit-logged as `audit.export`. */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const { csv, filename } = await exportAuditCsv(user!, {
      q: sp.q,
      entity: sp.entity,
      actor: sp.actor,
      from: sp.from,
      to: sp.to,
    });
    return csvResponse(filename, csv);
  },
  { permission: "audit:read" },
);
