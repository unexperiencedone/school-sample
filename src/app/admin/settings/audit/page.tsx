import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { qs } from "@/lib/crm/qs";
import { parseListParams } from "@/lib/crm/list";
import { formatDateTime } from "@/lib/dates";
import { auditFacets, listAuditLogs } from "@/lib/services/audit-viewer";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { THead, Th } from "@/components/ui/table";
import { ScrollRegion } from "../scroll-region";
import { AuditRow } from "./audit-row";

export const metadata = { title: "Audit log" };

const FILTER_KEYS = ["q", "entity", "actor", "from", "to"] as const;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("audit:read");
  const sp = await searchParams;
  const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 50 });
  const [facets, { rows, next, prev, total }] = await Promise.all([
    auditFacets(user),
    listAuditLogs(user, { q: sp.q, entity: sp.entity, actor: sp.actor, from: sp.from, to: sp.to }, p),
  ]);
  const exportQuery = qs(Object.fromEntries(FILTER_KEYS.map((k) => [k, sp[k]])), {});

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and why. Passwords, tokens and medical details are never shown. Dates and times are IST."
        actions={
          <a
            href={`/api/admin/audit-logs/export${exportQuery}`}
            className="inline-flex h-11 items-center gap-1.5 rounded-md border border-line px-4 text-sm font-medium hover:bg-sunken focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Action contains",
            placeholder: "Action contains… e.g. role_change",
          },
          {
            type: "select",
            name: "entity",
            label: "Entity",
            options: facets.entities.map((e) => ({ value: e, label: e })),
          },
          {
            type: "select",
            name: "actor",
            label: "Actor",
            options: [
              ...facets.actors.map((a) => ({ value: a.id, label: a.label })),
              ...(facets.hasSystem ? [{ value: "none", label: "System (no actor)" }] : []),
            ],
          },
          { type: "date", name: "from", label: "From (IST)" },
          { type: "date", name: "to", label: "To (IST)" },
        ]}
      />
      <Card className="overflow-hidden">
        {rows.length ? (
          <ScrollRegion label="Audit log entries">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Audit log entries, newest first</caption>
              <THead>
                <tr>
                  <Th>When (IST)</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>
                    <span className="sr-only">Details</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <AuditRow key={r.id} row={{ ...r, when: formatDateTime(r.createdAt) }} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <div className="p-6">
            <EmptyState title="No entries match">Try widening the dates or clearing a filter.</EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </Card>
    </>
  );
}
