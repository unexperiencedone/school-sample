import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Flag } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { BOARDING_LABEL } from "@/lib/services/fee-data";
import type { BreakdownStep } from "@/lib/fee-engine";
import { PageHeader } from "@/components/crm/page-header";
import { FeeStatusBadge } from "@/components/crm/badges";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { WaiveLateFee } from "./waive";

export const metadata = { title: "Invoice" };

type Breakdown = {
  steps?: BreakdownStep[];
  skipped?: { code: string; reason: string }[];
  structureVersion?: number;
  repricedAt?: string;
  repriceReason?: string;
  rebateForfeited?: { amountPaise: number; on: string };
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("fees:read");
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      lines: true,
      instalments: { orderBy: { seq: "asc" } },
      plan: true,
      year: true,
      structure: true,
      student: { include: { class: true, wallet: true } },
      allocations: {
        include: { payment: { include: { receipt: true } }, instalment: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!inv) notFound();
  const history = await db.auditLog.findMany({
    where: {
      OR: [
        { entity: "Invoice", entityId: inv.id },
        { entity: "Instalment", entityId: { in: inv.instalments.map((i) => i.id) } },
      ],
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const b = (inv.breakdown ?? {}) as Breakdown;
  const concessionNames = new Map(
    (await db.concession.findMany({ select: { code: true, name: true } })).map((c) => [c.code, c.name]),
  );
  const balance = inv.totalPaise + inv.lateFeePaise - inv.paidPaise;
  const wallet = inv.student.wallet.reduce((a, w) => a + w.amountPaise, 0);
  const firstOpen = inv.instalments.find(
    (i) => i.paidPaise < i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise),
  );
  const canWaive = can(user.role, "fees:waive");
  return (
    <>
      <PageHeader
        eyebrow={`Invoice · ${inv.year.name} · structure v${inv.structure.version}`}
        title={inv.number}
        description={
          <>
            <Link href={`/admin/fees/invoices?student=${inv.studentId}`} className="underline">
              {inv.student.firstName} {inv.student.lastName}
            </Link>{" "}
            · {inv.student.class.name} · {BOARDING_LABEL[inv.student.boardingType]} · {inv.plan.name} · issued{" "}
            {formatDate(inv.issuedAt)}
          </>
        }
        actions={
          <>
            <FeeStatusBadge status={inv.status} />
            {inv.cancellationFlag && (
              <span className="inline-flex items-center gap-1 text-sm text-danger">
                <Flag className="size-4" aria-hidden /> Flagged for review
              </span>
            )}
            <a
              href={`/api/invoices/${inv.id}/pdf`}
              target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
            >
              <Download className="size-4" aria-hidden /> PDF
            </a>
            {can(user.role, "payments:record") && balance > 0 && (
              <Link
                href={`/admin/payments/new?student=${inv.studentId}${firstOpen ? `&instalment=${firstOpen.id}` : ""}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Record payment
              </Link>
            )}
          </>
        }
      />
      {b.repricedAt && (
        <p role="status" className="mb-4 rounded-md bg-info-bg px-4 py-3 text-sm text-info">
          Repriced on {formatDateTime(b.repricedAt)}: {b.repriceReason}
        </p>
      )}
      {b.rebateForfeited && (
        <p role="status" className="mb-4 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning">
          Advance-payment rebate of {formatINR(b.rebateForfeited.amountPaise)} forfeited on{" "}
          {formatDate(b.rebateForfeited.on)} — not paid in full by the rebate date.
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Instalments</CardTitle>
              <span className="text-sm">
                Balance <span className="font-semibold tabular-nums">{formatINR(Math.max(0, balance))}</span>
              </span>
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <Th>Instalment</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Late fee</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Outstanding</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <tbody>
                {inv.instalments.map((i) => {
                  const late = i.lateFeeWaived ? 0 : i.lateFeePaise;
                  const out = i.amountPaise + late - i.paidPaise;
                  return (
                    <Tr key={i.id}>
                      <Td className="font-medium">{i.label}</Td>
                      <Td className="tabular-nums">{formatDate(i.dueDate)}</Td>
                      <Td className="text-right tabular-nums">{formatINR(i.amountPaise)}</Td>
                      <Td className="text-right tabular-nums">
                        {i.lateFeeWaived ? (
                          <span className="text-muted" title={i.waiveReason ?? undefined}>
                            <s>{formatINR(i.lateFeePaise)}</s> waived
                          </span>
                        ) : i.lateFeePaise ? (
                          <span className="inline-flex items-center gap-2">
                            {formatINR(i.lateFeePaise)}
                            {canWaive && out > 0 && <WaiveLateFee instalmentId={i.id} />}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{formatINR(i.paidPaise)}</Td>
                      <Td className="text-right font-medium tabular-nums">
                        {out > 0 ? formatINR(out) : "—"}
                      </Td>
                      <Td>
                        <FeeStatusBadge status={i.status} />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How this invoice was calculated</CardTitle>
              <span className="text-xs text-muted">Every step the fee engine took, in order</span>
            </CardHeader>
            <CardBody>
              <ol className="space-y-0">
                {(b.steps ?? []).map((st, k) => (
                  <li
                    key={k}
                    className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-b border-line py-2 text-sm last:border-0"
                  >
                    <span>
                      <span className="font-medium">{st.label}</span>
                      <span className="block text-xs text-muted">{st.detail}</span>
                    </span>
                    <span className={`tabular-nums ${st.amountPaise < 0 ? "text-success" : ""}`}>
                      {formatINR(st.amountPaise, { sign: st.amountPaise < 0 })}
                    </span>
                    <span className="w-28 text-right text-muted tabular-nums">
                      {formatINR(st.runningTotalPaise)}
                    </span>
                  </li>
                ))}
              </ol>
              {!!b.skipped?.length && (
                <div className="mt-4 rounded-md bg-sunken p-3 text-sm">
                  <p className="font-medium">Considered but not applied</p>
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {b.skipped.map((x) => (
                      <li key={x.code}>
                        {concessionNames.get(x.code) ?? x.code}: {x.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments applied</CardTitle>
            </CardHeader>
            {inv.allocations.length ? (
              <Table>
                <THead>
                  <tr>
                    <Th>Received</Th>
                    <Th>Receipt</Th>
                    <Th>Method</Th>
                    <Th>To</Th>
                    <Th className="text-right">Applied</Th>
                  </tr>
                </THead>
                <tbody>
                  {inv.allocations.map((a) => (
                    <Tr key={a.id}>
                      <Td className="tabular-nums">{formatDate(a.payment.receivedAt)}</Td>
                      <Td>
                        {a.payment.receipt ? (
                          <a
                            href={`/api/receipts/${a.payment.receipt.id}`}
                            target="_blank"
                            className="hover:underline"
                          >
                            {a.payment.receipt.number}
                          </a>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-muted">
                        {a.payment.method.replace("_", " ").toLowerCase()}
                        {a.payment.reference ? ` · ${a.payment.reference}` : ""}
                      </Td>
                      <Td>{a.instalment?.label ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{formatINR(a.amountPaise)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <CardBody>
                <p className="text-sm text-muted">No payments yet.</p>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                {[
                  ["Fees before concessions", inv.subtotalPaise],
                  ["Concessions", -inv.discountPaise],
                  ["Advance rebate", -inv.rebatePaise],
                  ["Invoice total", inv.totalPaise],
                  ["Late fees", inv.lateFeePaise],
                  ["Paid", -inv.paidPaise],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular-nums">{formatINR(Number(v))}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <dt>Balance</dt>
                  <dd className="tabular-nums">{formatINR(Math.max(0, balance))}</dd>
                </div>
                {wallet !== 0 && (
                  <div className="flex justify-between gap-3 text-success">
                    <dt>Credit on account</dt>
                    <dd className="tabular-nums">{formatINR(wallet)}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line text-sm">
              {inv.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 px-5 py-2">
                  <span className={l.amountPaise < 0 ? "text-success" : undefined}>{l.description}</span>
                  <span className="tabular-nums">{formatINR(l.amountPaise)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            {history.length ? (
              <ol className="divide-y divide-line text-sm">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <span className="font-medium">{h.action.replace(/[._]/g, " ")}</span>
                    {h.reason && <span className="block text-xs">{h.reason}</span>}
                    <span className="block text-xs text-muted">
                      {h.actor?.name ?? "System"} · {formatDateTime(h.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <CardBody>
                <p className="text-sm text-muted">Issued as calculated; no changes since.</p>
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
