import Link from "next/link";
import type { RefundStatus } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { RefundStatusBadge } from "@/components/crm/badges";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { RefundActions } from "./refund-actions";

export const metadata = { title: "Refunds" };

const TABS: { key: string; label: string; statuses: RefundStatus[] }[] = [
  { key: "open", label: "In progress", statuses: ["REQUESTED", "APPROVED"] },
  { key: "REQUESTED", label: "Awaiting approval", statuses: ["REQUESTED"] },
  { key: "APPROVED", label: "To pay out", statuses: ["APPROVED"] },
  { key: "done", label: "Completed", statuses: ["PROCESSED", "REJECTED", "FAILED", "CLOSED"] },
];

/** Request → approve (a different person) → pay out through the gateway or by bank transfer. Every step audited. */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff("payments:read");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.status) ?? TABS[0]!;
  const refunds = await db.refund.findMany({
    where: { status: { in: tab.statuses } },
    include: {
      payment: {
        include: {
          receipt: true,
          student: {
            select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const people = await db.user.findMany({
    where: {
      id: { in: refunds.flatMap((r) => [r.requestedById, r.approvedById]).filter((x): x is string => !!x) },
    },
    select: { id: true, name: true },
  });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader
        title="Refunds"
        description="Requested by Accounts, approved by the Principal (never the same person), then paid back through the gateway or by bank transfer."
        actions={
          can(user.role, "refunds:request") && (
            <Link
              href="/admin/payments/refunds/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              New refund request
            </Link>
          )
        }
      />
      <nav aria-label="Refund status" className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/payments/refunds?status=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              t.key === tab.key ? "bg-primary text-primary-fg" : "text-muted hover:bg-sunken hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {refunds.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Requested</Th>
                <Th>Pupil · payment</Th>
                <Th className="text-right">Amount</Th>
                <Th>Reason</Th>
                <Th>People</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </THead>
            <tbody>
              {refunds.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatDate(r.createdAt)}</Td>
                  <Td>
                    {r.payment.student
                      ? `${r.payment.student.firstName} ${r.payment.student.lastName}`
                      : "Registration"}
                    <span className="block text-xs text-muted">
                      {r.payment.receipt ? (
                        <a
                          href={`/api/receipts/${r.payment.receipt.id}`}
                          target="_blank"
                          className="hover:underline"
                        >
                          {r.payment.receipt.number}
                        </a>
                      ) : (
                        "—"
                      )}{" "}
                      · {formatINR(r.payment.amountPaise)} by{" "}
                      {r.payment.method.toLowerCase().replace("_", " ")}
                    </span>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{formatINR(r.amountPaise)}</Td>
                  <Td className="max-w-xs text-sm">
                    {r.reason}
                    {r.note && <span className="block text-xs text-muted">Note: {r.note}</span>}
                  </Td>
                  <Td className="text-xs text-muted">
                    Requested by {name(r.requestedById)}
                    {r.approvedById && (
                      <span className="block">
                        {r.status === "REJECTED" ? "Rejected" : "Approved"} by {name(r.approvedById)}
                      </span>
                    )}
                    {r.processedAt && <span className="block">Paid out {formatDate(r.processedAt)}</span>}
                  </Td>
                  <Td>
                    <RefundStatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <RefundActions
                      id={r.id}
                      status={r.status}
                      canApprove={can(user.role, "refunds:approve")}
                      canProcess={can(user.role, "payments:record")}
                      isRequester={r.requestedById === user.id}
                      manual={r.payment.provider === "manual"}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="Nothing here" />
          </div>
        )}
      </div>
    </>
  );
}
