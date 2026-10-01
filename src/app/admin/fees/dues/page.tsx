import Link from "next/link";
import { Download, Flag } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { listDues, type DuesFilter } from "@/lib/services/dues";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { RemindButton } from "./remind-button";

export const metadata = { title: "Dues" };

const TABS: { key: DuesFilter; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Due in 30 days" },
  { key: "flagged", label: "Flagged for review" },
];

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("fees:read");
  const sp = await searchParams;
  const filter = (TABS.some((t) => t.key === sp.filter) ? sp.filter : "overdue") as DuesFilter;
  const [rows, classes] = await Promise.all([
    listDues(filter, { classId: sp.class, q: sp.q }),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
  ]);
  const total = rows.reduce((a, r) => a + r.outstandingPaise, 0);
  const late = rows.reduce((a, r) => a + r.lateFeePaise, 0);
  const pupils = new Set(rows.map((r) => r.student.id)).size;
  const over90 = rows.filter((r) => r.daysOverdue > 90).length;
  const canRemind = can(user.role, "comms:send");
  const canRecord = can(user.role, "payments:record");
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
  return (
    <>
      <PageHeader
        title="Dues"
        description="What is owed, by whom and since when. Reminders go automatically once a week; send one now from any row."
        actions={
          <a
            href={`/api/admin/dues/export?${qs.toString()}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        }
      />
      <nav aria-label="Dues view" className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/fees/dues?filter=${t.key}`}
            aria-current={t.key === filter ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              t.key === filter ? "bg-primary text-primary-fg" : "text-muted hover:bg-sunken hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          kpi={{
            key: "total",
            label: filter === "upcoming" ? "Falling due" : "Outstanding",
            value: formatINR(total, { compact: true }),
            sub: formatINR(total),
          }}
        />
        <StatTile
          kpi={{ key: "pupils", label: "Pupils", value: String(pupils), sub: `${rows.length} instalments` }}
        />
        <StatTile
          kpi={{
            key: "late",
            label: "Of which late fees",
            value: formatINR(late, { compact: true }),
            sub: "Waivable with a reason",
          }}
        />
        <StatTile
          kpi={{
            key: "90",
            label: "Overdue > 90 days",
            value: String(over90),
            status: over90 ? "critical" : "good",
            href: "/admin/fees/dues?filter=flagged",
          }}
        />
      </div>
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search dues", placeholder: "Pupil or invoice no.…" },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Pupil</Th>
                <Th>Instalment</Th>
                <Th>Due</Th>
                <Th className="text-right">Principal</Th>
                <Th className="text-right">Late fee</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Last reminder</Th>
                <Th />
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.instalmentId}>
                  <Td>
                    <span className="font-medium">{r.student.name}</span>
                    <span className="block text-xs text-muted">
                      {r.student.className} · {r.student.admissionNo}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/admin/fees/invoices/${r.invoiceId}`} className="hover:underline">
                      {r.invoiceNumber}
                    </Link>
                    <span className="block text-xs text-muted">{r.label}</span>
                  </Td>
                  <Td className="tabular-nums">
                    {formatDate(r.dueDate)}
                    {r.daysOverdue > 0 && (
                      <span
                        className={cn(
                          "block text-xs",
                          r.daysOverdue > 90 ? "font-medium text-danger" : "text-muted",
                        )}
                      >
                        {r.daysOverdue} days overdue
                        {r.flagged && <Flag className="ml-1 inline size-3" aria-label="flagged" />}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{formatINR(r.principalPaise)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.lateFeePaise ? formatINR(r.lateFeePaise) : "—"}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{formatINR(r.outstandingPaise)}</Td>
                  <Td className="text-sm text-muted">
                    {r.lastReminderAt ? formatDate(r.lastReminderAt, "d MMM") : "—"}
                  </Td>
                  <Td>
                    <span className="flex justify-end gap-3">
                      {canRemind && <RemindButton instalmentId={r.instalmentId} />}
                      {canRecord && (
                        <Link
                          href={`/admin/payments/new?student=${r.student.id}&instalment=${r.instalmentId}`}
                          className="text-xs text-primary underline"
                        >
                          Record payment
                        </Link>
                      )}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState
              title={filter === "upcoming" ? "Nothing falls due in the next 30 days" : "Nothing outstanding"}
            />
          </div>
        )}
      </div>
    </>
  );
}
