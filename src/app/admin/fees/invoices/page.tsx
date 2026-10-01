import Link from "next/link";
import { Flag } from "lucide-react";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { FeeStatusBadge } from "@/components/crm/badges";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { TableKeys } from "@/components/crm/table/table-keys";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Invoices" };

const include = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      class: { select: { name: true } },
    },
  },
  plan: { select: { name: true } },
  year: { select: { name: true } },
} satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof include }>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("fees:read");
  const sp = await searchParams;
  const p = parseListParams(sp, {
    sorts: ["issuedAt", "number", "totalPaise", "paidPaise"],
    defaultSort: "number",
    defaultDir: "asc",
  });
  const [years, classes] = await Promise.all([
    db.academicYear.findMany({ orderBy: { startDate: "asc" } }),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
  ]);
  const year = years.find((y) => y.name === sp.year) ?? years.find((y) => y.isCurrent)!;
  const where: Prisma.InvoiceWhereInput = {
    ...(sp.student ? { studentId: sp.student } : { yearId: year.id }),
    ...(sp.status ? { status: sp.status as InvoiceStatus } : {}),
    ...(sp.class ? { student: { classId: sp.class } } : {}),
    ...(sp.flagged === "1" ? { cancellationFlag: true } : {}),
    ...(sp.q
      ? {
          OR: [
            { number: { contains: sp.q, mode: "insensitive" } },
            { student: { firstName: { contains: sp.q, mode: "insensitive" } } },
            { student: { lastName: { contains: sp.q, mode: "insensitive" } } },
            { student: { admissionNo: { contains: sp.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [{ rows, next, prev, total }, sums] = await Promise.all([
    cursorList<Row>(db.invoice, { where, include }, p),
    db.invoice.aggregate({ where, _sum: { totalPaise: true, paidPaise: true, lateFeePaise: true } }),
  ]);
  const billed = (sums._sum.totalPaise ?? 0) + (sums._sum.lateFeePaise ?? 0);
  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          <>
            {total} invoices · {formatINR(billed, { compact: true })} billed incl. late fees ·{" "}
            {formatINR(sums._sum.paidPaise ?? 0, { compact: true })} collected
          </>
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search invoices",
            placeholder: "Invoice no., pupil or admission no.…",
          },
          {
            type: "select",
            name: "year",
            label: "Year",
            options: years.map((y) => ({ value: y.name, label: y.name })),
          },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: ["OPEN", "PARTIAL", "OVERDUE", "PAID", "WAIVED", "VOID"].map((s) => ({
              value: s,
              label: s.toLowerCase(),
            })),
          },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            type: "select",
            name: "flagged",
            label: "Flag",
            options: [{ value: "1", label: "Flagged for review" }],
          },
        ]}
      />
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="number" label="Invoice" current={p.sort} dir={p.dir} />
                <Th>Pupil</Th>
                <Th>Plan</Th>
                <SortTh
                  sp={sp}
                  field="totalPaise"
                  label="Total"
                  current={p.sort}
                  dir={p.dir}
                  className="text-right"
                />
                <SortTh
                  sp={sp}
                  field="paidPaise"
                  label="Paid"
                  current={p.sort}
                  dir={p.dir}
                  className="text-right"
                />
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((i) => {
                const balance = i.totalPaise + i.lateFeePaise - i.paidPaise;
                return (
                  <Tr key={i.id} data-row>
                    <Td>
                      <Link
                        data-row-link
                        href={`/admin/fees/invoices/${i.id}`}
                        className="font-medium hover:underline"
                      >
                        {i.number}
                      </Link>
                      <span className="block text-xs text-muted">{i.year.name}</span>
                    </Td>
                    <Td>
                      {i.student.firstName} {i.student.lastName}
                      <span className="block text-xs text-muted">
                        {i.student.class.name} · {i.student.admissionNo}
                      </span>
                    </Td>
                    <Td className="text-muted">{i.plan.name}</Td>
                    <Td className="text-right tabular-nums">{formatINR(i.totalPaise)}</Td>
                    <Td className="text-right tabular-nums">{formatINR(i.paidPaise)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {balance > 0 ? formatINR(balance) : <span className="text-muted">—</span>}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <FeeStatusBadge status={i.status} />
                        {i.cancellationFlag && (
                          <span
                            className="inline-flex items-center gap-0.5 text-xs text-danger"
                            title="Flagged for cancellation review"
                          >
                            <Flag className="size-3.5" aria-hidden /> flagged
                          </span>
                        )}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No invoices match">Try another year or clear the filters.</EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
