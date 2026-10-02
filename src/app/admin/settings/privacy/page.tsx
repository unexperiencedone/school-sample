import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { qs } from "@/lib/crm/qs";
import { parseListParams } from "@/lib/crm/list";
import { formatDateTime } from "@/lib/dates";
import { listDataRequests, requestCounts } from "@/lib/services/privacy";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { THead, Th, Tr, Td } from "@/components/ui/table";
import { ScrollRegion } from "../scroll-region";
import { KindLabel, StatusBadge } from "./badges";

export const metadata = { title: "Privacy requests" };

const TABS = [
  { value: "OPEN", label: "Open" },
  { value: "DONE", label: "Done" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
] as const;

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("privacy:manage");
  const sp = await searchParams;
  const status = sp.status ?? "OPEN";
  const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 25 });
  const [counts, { rows, next, prev, total }] = await Promise.all([
    requestCounts(user, sp.kind),
    listDataRequests(user, { status, kind: sp.kind }, p),
  ]);

  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Requests from families to see or erase what the school holds about them. Each outcome needs notes and is audit-logged."
      />
      <nav aria-label="Request status" className="mb-4">
        <ul className="inline-flex flex-wrap gap-1 rounded-lg bg-sunken p-1">
          {TABS.map((t) => {
            const active = status === t.value;
            return (
              <li key={t.value}>
                <Link
                  href={qs(sp, { status: t.value })}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    active ? "bg-elevated text-primary shadow-soft" : "text-muted hover:text-fg"
                  }`}
                >
                  {t.label} ({counts[t.value] ?? 0})
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "select",
            name: "kind",
            label: "Kind",
            options: [
              { value: "EXPORT", label: "Data export" },
              { value: "DELETION", label: "Deletion" },
            ],
          },
        ]}
      />
      <Card className="overflow-hidden">
        {rows.length ? (
          <ScrollRegion label="Privacy requests">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Privacy requests</caption>
              <THead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Kind</Th>
                  <Th>Status</Th>
                  <Th>Requested (IST)</Th>
                  <Th>Handled by</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id} data-request={r.subjectEmail}>
                    <Td className="font-medium">{r.subjectEmail}</Td>
                    <Td>
                      <KindLabel kind={r.kind} />
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
                    <Td className="text-muted">{r.handledBy ?? "—"}</Td>
                    <Td>
                      <Link
                        href={`/admin/settings/privacy/${r.id}`}
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-focus"
                      >
                        Open<span className="sr-only"> request from {r.subjectEmail}</span>
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <div className="p-6">
            <EmptyState title="No requests here">
              {status === "OPEN" ? "Nothing is waiting for a decision." : "No requests match these filters."}
            </EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </Card>
    </>
  );
}
