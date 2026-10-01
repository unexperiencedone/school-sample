import type { OrderStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Payment orders" };
const include = { payments: { select: { id: true } } } satisfies Prisma.PaymentOrderInclude;
type Row = Prisma.PaymentOrderGetPayload<{ include: typeof include }>;

const PURPOSE: Record<string, string> = {
  REGISTRATION: "Registration fee",
  INVOICE: "Invoice",
  INSTALMENT: "Instalment",
  CUSTOM: "Other",
  IMPREST_TOPUP: "Pocket-money top-up",
};

/** Checkout attempts created for families. An order becomes PAID only when the signed webhook confirms it. */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("payments:read");
  const sp = await searchParams;
  const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt" });
  const where: Prisma.PaymentOrderWhereInput = {
    ...(sp.status ? { status: sp.status as OrderStatus } : {}),
    ...(sp.q ? { OR: [{ providerOrderId: { contains: sp.q } }, { receipt: { contains: sp.q } }] } : {}),
  };
  const { rows, next, prev, total } = await cursorList<Row>(db.paymentOrder, { where, include }, p);
  const statuses = await db.paymentOrder.groupBy({ by: ["status"], _count: true });
  return (
    <>
      <PageHeader
        title="Payment orders"
        description="Every online checkout started, whether or not it was completed."
      />
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search orders", placeholder: "Order id or reference…" },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: statuses.map((s) => ({
              value: s.status,
              label: `${s.status.toLowerCase()} (${s._count})`,
            })),
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Created</Th>
                <Th>Order</Th>
                <Th>For</Th>
                <Th>Customer</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((o) => {
                const c = o.customer as { name?: string; email?: string };
                return (
                  <Tr key={o.id}>
                    <Td className="text-sm whitespace-nowrap tabular-nums">{formatDateTime(o.createdAt)}</Td>
                    <Td>
                      <span className="font-mono text-xs">{o.providerOrderId}</span>
                      <span className="block text-xs text-muted">{o.provider}</span>
                    </Td>
                    <Td>{PURPOSE[o.purpose] ?? o.purpose}</Td>
                    <Td className="text-sm">
                      {c.name}
                      <span className="block text-xs text-muted">{c.email}</span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatINR(o.amountPaise)}</Td>
                    <Td>
                      <Badge
                        tone={
                          o.status === "PAID"
                            ? "success"
                            : o.status === "FAILED"
                              ? "danger"
                              : o.status === "EXPIRED"
                                ? "neutral"
                                : "info"
                        }
                      >
                        {o.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No orders" />
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
