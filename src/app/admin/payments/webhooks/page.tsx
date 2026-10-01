import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Webhook log" };
type Row = Prisma.WebhookEventGetPayload<object>;

/** Every gateway callback: signature check, processing result and the raw payload. Duplicates never get this far. */
export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("payments:read");
  const sp = await searchParams;
  const p = parseListParams(sp, { sorts: ["receivedAt"], defaultSort: "receivedAt", take: 30 });
  const where: Prisma.WebhookEventWhereInput = {
    ...(sp.provider ? { provider: sp.provider } : {}),
    ...(sp.result === "error"
      ? { error: { not: null } }
      : sp.result === "invalid"
        ? { signatureValid: false }
        : {}),
    ...(sp.q ? { OR: [{ eventId: { contains: sp.q } }, { type: { contains: sp.q } }] } : {}),
  };
  const { rows, next, prev, total } = await cursorList<Row>(db.webhookEvent, { where }, p);
  return (
    <>
      <PageHeader
        title="Webhook log"
        description="Each event is stored once per provider event id; a replayed delivery is acknowledged without being processed again."
      />
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search events", placeholder: "Event id or type…" },
          {
            type: "select",
            name: "provider",
            label: "Provider",
            options: ["mock", "razorpay", "payu", "cashfree"].map((v) => ({ value: v, label: v })),
          },
          {
            type: "select",
            name: "result",
            label: "Result",
            options: [
              { value: "error", label: "Processing error" },
              { value: "invalid", label: "Bad signature" },
            ],
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Received</Th>
                <Th>Provider</Th>
                <Th>Event</Th>
                <Th>Signature</Th>
                <Th>Result</Th>
                <Th>Payload</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => (
                <Tr key={e.id}>
                  <Td className="text-sm whitespace-nowrap tabular-nums">{formatDateTime(e.receivedAt)}</Td>
                  <Td>{e.provider}</Td>
                  <Td>
                    <span className="font-medium">{e.type}</span>
                    <span className="block font-mono text-xs text-muted">{e.eventId}</span>
                  </Td>
                  <Td>
                    {e.signatureValid ? (
                      <Badge tone="success">valid</Badge>
                    ) : (
                      <Badge tone="danger">invalid</Badge>
                    )}
                  </Td>
                  <Td className="text-sm">
                    {e.error ? (
                      <span className="text-danger">{e.error}</span>
                    ) : e.processedAt ? (
                      <span className="text-muted">processed {formatDateTime(e.processedAt)}</span>
                    ) : (
                      <span className="text-muted">received</span>
                    )}
                  </Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-xs text-primary underline">View</summary>
                      <pre className="mt-2 max-h-64 max-w-md overflow-auto rounded bg-sunken p-2 text-xs">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </details>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No webhook events yet">
              Pay something through the mock gateway to see one arrive.
            </EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
