import Link from "next/link";
import { Download, KanbanSquare } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { parseListParams } from "@/lib/crm/list";
import { qs } from "@/lib/crm/qs";
import { listViews } from "@/lib/crm/saved-views";
import {
  assignableStaff,
  leadFacets,
  listLeads,
  LEAD_SORTS,
  type LeadFilters,
} from "@/lib/services/leads-admin";
import { LEAD_STATUS_FLOW, LEAD_STATUS_LABEL, leadRef } from "@/lib/services/leads";
import { PageHeader } from "@/components/crm/page-header";
import { LeadStatusBadge } from "@/components/crm/badges";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { RowCheckbox, SelectAllCheckbox, SelectionProvider } from "@/components/crm/table/selection";
import { SavedViews } from "@/components/crm/table/saved-views";
import { TableKeys } from "@/components/crm/table/table-keys";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/dates";
import { LeadBulkActions } from "./lead-bulk";

export const metadata = { title: "Leads" };

type SP = Record<string, string | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff("leads:read");
  const sp = await searchParams;
  const params = parseListParams(sp, { sorts: LEAD_SORTS, defaultSort: "createdAt" });
  const filters: LeadFilters = {
    q: sp.q,
    status: sp.status,
    source: sp.source,
    classApplying: sp.class,
    assignee: sp.assignee,
    type: sp.type,
    from: sp.from,
    to: sp.to,
    utmSource: sp.utm,
  };
  const [{ rows, next, prev, total }, staff, facets, views] = await Promise.all([
    listLeads(filters, params, user.id),
    assignableStaff(),
    leadFacets(),
    listViews(user.id, "leads"),
  ]);
  const statuses = LEAD_STATUS_FLOW.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }));
  const exportQuery = qs(sp, {}).slice(1);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every enquiry and tour booking from the website, WhatsApp and walk-ins."
        actions={
          <>
            <Link
              href="/admin/leads/pipeline"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
            >
              <KanbanSquare className="size-4" aria-hidden /> Pipeline
            </Link>
            {can(user.role, "leads:export") && (
              <a
                href={`/api/admin/leads/export${qs(sp, {})}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
              >
                <Download className="size-4" aria-hidden /> Export CSV
              </a>
            )}
          </>
        }
      />
      <div className="mb-3">
        <SavedViews module="leads" views={views} />
      </div>
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search leads",
            placeholder: "Search name, email, phone, child…",
          },
          { type: "select", name: "status", label: "Status", options: statuses },
          {
            type: "select",
            name: "source",
            label: "Source",
            options: facets.sources.map((s) => ({ value: s, label: s })),
          },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: facets.classes.sort().map((c) => ({ value: c, label: c })),
          },
          {
            type: "select",
            name: "assignee",
            label: "Assigned",
            options: [
              { value: "me", label: "Me" },
              { value: "none", label: "Unassigned" },
              ...staff.map((s) => ({ value: s.id, label: s.name ?? s.id })),
            ],
          },
          {
            type: "select",
            name: "type",
            label: "Type",
            options: [
              { value: "ENQUIRY", label: "Enquiry" },
              { value: "TOUR", label: "Tour" },
            ],
          },
          { type: "date", name: "from", label: "From" },
          { type: "date", name: "to", label: "To" },
        ]}
      />
      <SelectionProvider ids={rows.map((r) => r.id)}>
        <TableKeys />
        <div className="overflow-hidden rounded-lg border border-line bg-elevated">
          {rows.length ? (
            <Table>
              <THead>
                <tr>
                  <Th className="w-10">
                    <SelectAllCheckbox />
                  </Th>
                  <SortTh
                    sp={sp}
                    field="parentName"
                    label="Parent / child"
                    current={params.sort}
                    dir={params.dir}
                  />
                  <SortTh
                    sp={sp}
                    field="classApplying"
                    label="Class"
                    current={params.sort}
                    dir={params.dir}
                  />
                  <Th>Source</Th>
                  <SortTh sp={sp} field="status" label="Status" current={params.sort} dir={params.dir} />
                  <Th>Assigned</Th>
                  <SortTh
                    sp={sp}
                    field="nextFollowUpAt"
                    label="Follow-up"
                    current={params.sort}
                    dir={params.dir}
                  />
                  <SortTh sp={sp} field="createdAt" label="Received" current={params.sort} dir={params.dir} />
                </tr>
              </THead>
              <tbody>
                {rows.map((l) => (
                  <Tr key={l.id} data-row>
                    <Td>
                      <RowCheckbox id={l.id} label={l.parentName} />
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/leads/${l.id}`}
                        data-row-link
                        className="font-medium text-fg hover:underline"
                      >
                        {l.parentName}
                      </Link>
                      <div className="text-xs text-muted">
                        {l.childName ?? "—"} · {leadRef(l)}
                        {l.type === "TOUR" && " · tour"}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{l.classApplying}</Td>
                    <Td>
                      <div>{l.source}</div>
                      {l.utmSource && (
                        <div className="text-xs text-muted">
                          {l.utmSource}/{l.utmMedium ?? "—"}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <LeadStatusBadge status={l.status} />
                    </Td>
                    <Td className="text-muted">{l.assignedTo?.name ?? "—"}</Td>
                    <Td
                      className={
                        l.nextFollowUpAt && l.nextFollowUpAt < new Date()
                          ? "font-medium text-danger"
                          : "text-muted"
                      }
                    >
                      {l.nextFollowUpAt ? formatDate(l.nextFollowUpAt, "d MMM") : "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDate(l.createdAt, "d MMM, h:mm a")}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState title="No leads match these filters">
                Try clearing a filter, or check the pipeline view.
              </EmptyState>
            </div>
          )}
          <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
        </div>
        <LeadBulkActions
          staff={staff}
          statuses={statuses}
          canAssign={can(user.role, "leads:assign")}
          canExport={can(user.role, "leads:export")}
          exportQuery={exportQuery}
        />
      </SelectionProvider>
      <p className="mt-3 text-xs text-muted">
        Shortcuts: <kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> open · <kbd>x</kbd>{" "}
        select
      </p>
    </>
  );
}
