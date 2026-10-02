"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Change } from "@/lib/services/audit-viewer-rules";
import { Tr, Td } from "@/components/ui/table";
import type { Role } from "@prisma/client";

export type AuditRowData = {
  id: string;
  when: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  actorRole: Role | null;
  ip: string | null;
  reason: string | null;
  changes: Change[];
  more: number;
};

const COLUMNS = 5;

/** One log entry plus its expandable detail row (reason, IP and the changed fields, already redacted on the server). */
export function AuditRow({ row }: { row: AuditRowData }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <Tr data-audit-row data-action={row.action} className="align-top">
        <Td className="whitespace-nowrap">{row.when}</Td>
        <Td>
          <span className="block font-medium">{row.actorName ?? "System"}</span>
          {row.actorRole && <span className="block text-xs text-muted">{ROLE_LABELS[row.actorRole]}</span>}
        </Td>
        <Td>
          <code className="text-xs break-all">{row.action}</code>
        </Td>
        <Td>
          {row.entity}
          {row.entityId && <span className="block max-w-40 truncate text-xs text-muted">{row.entityId}</span>}
        </Td>
        <Td>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-2.5 text-sm hover:bg-sunken focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {open ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
            {open ? "Hide details" : "Details"}
            <span className="sr-only">
              {" "}
              for {row.action} at {row.when}
            </span>
          </button>
        </Td>
      </Tr>
      <tr id={panelId} hidden={!open} className="border-b border-line bg-sunken/50">
        <td colSpan={COLUMNS} className="px-3 py-3">
          <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Reason</dt>
            <dd>{row.reason ?? "None given"}</dd>
            <dt className="text-muted">IP address</dt>
            <dd>{row.ip ?? "Unknown"}</dd>
          </dl>
          {row.changes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Changed fields</caption>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-4 font-semibold">
                      Field
                    </th>
                    <th scope="col" className="py-1 pr-4 font-semibold">
                      Before
                    </th>
                    <th scope="col" className="py-1 font-semibold">
                      After
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {row.changes.map((c) => (
                    <tr key={c.path} className="border-t border-line/70 align-top">
                      <th
                        scope="row"
                        className="py-1.5 pr-4 text-left font-mono text-xs font-normal break-all"
                      >
                        {c.path}
                      </th>
                      <td className="max-w-xs py-1.5 pr-4 break-words">
                        {c.before ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="max-w-xs py-1.5 break-words">
                        {c.after ?? <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {row.more > 0 && <p className="mt-2 text-xs text-muted">and {row.more} more changed fields</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">No field changes were recorded for this entry.</p>
          )}
        </td>
      </tr>
    </>
  );
}
