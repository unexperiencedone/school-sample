import Link from "next/link";
import type { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { cursorList, dateRange, parseListParams } from "@/lib/crm/list";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { PaymentStatusBadge } from "@/components/crm/badges";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { TableKeys } from "@/components/crm/table/table-keys";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Payments" };

const METHOD: Record<string, string> = {
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  WALLET: "Wallet",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  DEMAND_DRAFT: "Demand draft",
  CASH: "Cash",
};

const include = {
  receipt: true,
  student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
  application: { select: { id: true, ref: true, childFirstName: true, childLastName: true } },
} satisfies Prisma.PaymentInclude;
type Row = Prisma.PaymentGetPayload<{ include: typeof include }>;

/** Every payment received — online and offline — with its receipt. */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("payments:read");
  const sp = await searchParams;
  const p = parseListParams(sp, { sorts: ["receivedAt", "amountPaise"], defaultSort: "receivedAt" });
  const received = dateRange(sp.from, sp.to);
  const where: Prisma.PaymentWhereInput = {
    ...(sp.method ? { method: sp.method as PaymentMethod } : {}),
    ...(sp.status ? { status: sp.status as PaymentStatus } : {}),
    ...(sp.channel === "online"
      ? { provider: { not: "manual" } }
      : sp.channel === "offline"
        ? { provider: "manual" }
        : {}),
    ...(received ? { receivedAt: received } : {}),
    ...(sp.q
      ? {
          OR: [
            { receipt: { number: { contains: sp.q, mode: "insensitive" } } },
            { reference: { contains: sp.q, mode: "insensitive" } },
            { providerPaymentId: { contains: sp.q, mode: "insensitive" } },
            { student: { firstName: { contains: sp.q, mode: "insensitive" } } },
            { student: { lastName: { contains: sp.q, mode: "insensitive" } } },
            { application: { ref: { contains: sp.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [{ rows, next, prev, total }, sums] = await Promise.all([
    cursorList<Row>(db.payment, { where, include }, p),
    db.payment.aggregate({
      where: { ...where, status: { not: "FAILED" } },
      _sum: { amountPaise: true, refundedPaise: true },
    }),
  ]);
  const net = (sums._sum.amountPaise ?? 0) - (sums._sum.refundedPaise ?? 0);
  const recorders = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.recordedById).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  return (
    <>
      <PageHeader
        title="Payments"
        description={`${total} payments · ${formatINR(net)} received net of refunds`}
        actions={
          can(user.role, "payments:record") && (
            <Link
              href="/admin/payments/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              Record a payment
            </Link>
          )
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search payments",
            placeholder: "Receipt, reference, pupil or application…",
          },
          {
            type: "select",
            name: "channel",
            label: "Channel",
            options: [
              { value: "online", label: "Online (gateway)" },
              { value: "offline", label: "Offline (recorded)" },
            ],
          },
          {
            type: "select",
            name: "method",
            label: "Method",
            options: Object.entries(METHOD).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"].map((s) => ({
              value: s,
              label: s.toLowerCase().replace("_", " "),
            })),
          },
          { type: "date", name: "from", label: "From" },
          { type: "date", name: "to", label: "To" },
        ]}
      />
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="receivedAt" label="Received" current={p.sort} dir={p.dir} />
                <Th>Receipt</Th>
                <Th>For</Th>
                <Th>Method</Th>
                <SortTh
                  sp={sp}
                  field="amountPaise"
                  label="Amount"
                  current={p.sort}
                  dir={p.dir}
                  className="text-right"
                />
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id} data-row>
                  <Td className="whitespace-nowrap tabular-nums">
                    {formatDate(r.receivedAt, "d MMM yyyy")}
                    <span className="block text-xs text-muted">{formatDate(r.receivedAt, "h:mm a")}</span>
                  </Td>
                  <Td>
                    {r.receipt ? (
                      <a
                        data-row-link
                        href={`/api/receipts/${r.receipt.id}`}
                        target="_blank"
                        className="font-medium hover:underline"
                      >
                        {r.receipt.number}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {r.student ? (
                      <Link href={`/admin/fees/invoices?student=${r.student.id}`} className="hover:underline">
                        {r.student.firstName} {r.student.lastName}
                        <span className="block text-xs text-muted">{r.student.class.name} · fees</span>
                      </Link>
                    ) : r.application ? (
                      <Link href={`/admin/applications/${r.application.id}`} className="hover:underline">
                        {r.application.childFirstName} {r.application.childLastName}
                        <span className="block text-xs text-muted">Registration · {r.application.ref}</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {METHOD[r.method] ?? r.method}
                    <span className="block text-xs text-muted">
                      {r.provider === "manual"
                        ? `recorded by ${recorders.find((u) => u.id === r.recordedById)?.name ?? "staff"}`
                        : `${r.provider} gateway`}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </span>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatINR(r.amountPaise)}
                    {r.refundedPaise > 0 && (
                      <span className="block text-xs text-muted">−{formatINR(r.refundedPaise)} refunded</span>
                    )}
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={r.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No payments match" />
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
