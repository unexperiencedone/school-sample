"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/crm/table/selection";
import { bulkLeads } from "./actions";

export function LeadBulkActions({
  staff,
  statuses,
  canAssign,
  canExport,
  exportQuery,
}: {
  staff: { id: string; name: string | null }[];
  statuses: { value: string; label: string }[];
  canAssign: boolean;
  canExport: boolean;
  exportQuery: string;
}) {
  const [pending, start] = useTransition();
  const run = (ids: string[], clear: () => void, patch: { status?: string; assignedToId?: string | null }) =>
    start(async () => {
      const r = await bulkLeads(ids, patch);
      if (r.ok) {
        toast.success(r.message ?? "Done");
        clear();
      } else toast.error(r.error);
    });
  return (
    <BulkBar>
      {(ids, clear) => (
        <>
          {canAssign && (
            <select
              aria-label="Assign selected to"
              disabled={pending}
              defaultValue=""
              onChange={(e) =>
                e.target.value &&
                run(ids, clear, { assignedToId: e.target.value === "none" ? null : e.target.value })
              }
              className="h-8 rounded-md border border-line bg-elevated px-2 text-sm"
            >
              <option value="" disabled>
                Assign to…
              </option>
              <option value="none">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Set status of selected"
            disabled={pending}
            defaultValue=""
            onChange={(e) => e.target.value && run(ids, clear, { status: e.target.value })}
            className="h-8 rounded-md border border-line bg-elevated px-2 text-sm"
          >
            <option value="" disabled>
              Set status…
            </option>
            {statuses
              .filter((s) => s.value !== "LOST")
              .map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
          </select>
          {canExport && (
            <a
              href={`/api/admin/leads/export?${exportQuery}${exportQuery ? "&" : ""}ids=${ids.join(",")}`}
              className="text-sm font-medium text-primary underline"
            >
              Export {ids.length} to CSV
            </a>
          )}
        </>
      )}
    </BulkBar>
  );
}
