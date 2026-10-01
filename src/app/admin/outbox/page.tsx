import Link from "next/link";
import type { OutboxChannel, OutboxStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { TableKeys } from "@/components/crm/table/table-keys";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { TEMPLATES } from "@/lib/messages/templates";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Outbox" };
type Row = Prisma.OutboxGetPayload<object>;

const TONE: Record<OutboxStatus, "success" | "danger" | "neutral" | "info"> = {
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "neutral",
  QUEUED: "info",
};

/** Every email, WhatsApp, SMS and webhook the system sent (or tried to). With mock adapters, this is the inbox. */
export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("comms:read");
  const sp = await searchParams;
  const p = parseListParams(sp, { sorts: ["createdAt"], defaultSort: "createdAt", take: 50 });
  const where: Prisma.OutboxWhereInput = {
    ...(sp.channel ? { channel: sp.channel as OutboxChannel } : {}),
    ...(sp.status ? { status: sp.status as OutboxStatus } : {}),
    ...(sp.template ? { template: sp.template } : {}),
    ...(sp.q
      ? {
          OR: [
            { to: { contains: sp.q, mode: "insensitive" } },
            { subject: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const { rows, next, prev, total } = await cursorList<Row>(db.outbox, { where }, p);
  const mock = [process.env.EMAIL_PROVIDER, process.env.WHATSAPP_PROVIDER, process.env.SMS_PROVIDER].every(
    (x) => !x || x === "mock",
  );
  return (
    <>
      <PageHeader
        title="Outbox"
        description={
          mock
            ? "All providers are in MOCK mode: nothing leaves the building. Messages are recorded here exactly as they would be sent."
            : "Messages sent through the configured providers."
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search outbox", placeholder: "Recipient or subject…" },
          {
            type: "select",
            name: "channel",
            label: "Channel",
            options: ["EMAIL", "WHATSAPP", "SMS", "WEBHOOK"].map((c) => ({ value: c, label: c })),
          },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: ["SENT", "FAILED", "QUEUED", "SKIPPED"].map((c) => ({ value: c, label: c })),
          },
          {
            type: "select",
            name: "template",
            label: "Template",
            options: Object.entries(TEMPLATES).map(([k, v]) => ({ value: k, label: v.name })),
          },
        ]}
      />
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Channel</Th>
                <Th>To</Th>
                <Th>Message</Th>
                <Th>Provider</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((o) => (
                <Tr key={o.id} data-row>
                  <Td className="whitespace-nowrap text-muted">{formatDate(o.createdAt, "d MMM, h:mm a")}</Td>
                  <Td>{o.channel}</Td>
                  <Td className="max-w-56 truncate">{o.to}</Td>
                  <Td>
                    <Link data-row-link href={`/admin/outbox/${o.id}`} className="hover:underline">
                      {o.subject ?? TEMPLATES[o.template as keyof typeof TEMPLATES]?.name ?? o.template}
                    </Link>
                  </Td>
                  <Td className="text-muted">{o.provider}</Td>
                  <Td>
                    <Badge tone={TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                    {o.attempts > 1 && <span className="ml-1 text-xs text-muted">×{o.attempts}</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No messages yet" />
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
