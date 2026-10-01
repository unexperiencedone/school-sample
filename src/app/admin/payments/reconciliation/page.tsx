import Link from "next/link";
import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { awaitingBank } from "@/lib/services/reconciliation";
import { PageHeader } from "@/components/crm/page-header";
import { StatTile } from "@/components/charts/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { ImportForm, LineControls } from "./line-controls";

export const metadata = { title: "Reconciliation" };

const TONE = { MATCHED: "success", UNMATCHED: "warning", IGNORED: "neutral" } as const;

/** Bank statement in, matched against what the school recorded: by reference first, then by unique amount and date. */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  await requireStaff("reconciliation:run");
  const sp = await searchParams;
  const imports = await db.bankStatementImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { lines: { select: { matchStatus: true } } },
  });
  const current = imports.find((i) => i.id === sp.import) ?? imports[0];
  const lines = current
    ? await db.bankStatementLine.findMany({
        where: { importId: current.id },
        include: {
          payment: { include: { receipt: true, student: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      })
    : [];
  const open = lines.filter((l) => l.matchStatus === "UNMATCHED");
  const candidates = open.length
    ? await db.payment.findMany({
        where: {
          provider: "manual",
          status: { not: "FAILED" },
          amountPaise: { in: [...new Set(open.map((l) => l.amountPaise))] },
          bankLines: { none: { matchStatus: "MATCHED" } },
        },
        include: { receipt: true, student: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const waiting = await awaitingBank(30);
  const matched = lines.filter((l) => l.matchStatus === "MATCHED");
  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Import the school account's statement. Credits are matched to recorded payments; anything left needs a person."
        actions={
          <a
            href="/api/admin/reconciliation/sample"
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
          >
            <Download className="size-4" aria-hidden /> Sample statement
          </a>
        }
      />
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <ImportForm />
          <p className="max-w-md text-xs text-muted">
            Works with the CSV export of most Indian banks: the header row is found automatically, dates are
            read day-first, and only credits are imported. Payments are only ever matched when the amount
            agrees exactly.
          </p>
        </CardBody>
      </Card>

      {current ? (
        <>
          <nav aria-label="Imports" className="mb-3 flex flex-wrap gap-1 text-sm">
            {imports.map((i) => (
              <Link
                key={i.id}
                href={`/admin/payments/reconciliation?import=${i.id}`}
                aria-current={i.id === current.id ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 ${i.id === current.id ? "bg-sunken font-medium" : "text-muted hover:text-fg"}`}
              >
                {i.fileName} · {formatDate(i.createdAt, "d MMM")}
              </Link>
            ))}
          </nav>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              kpi={{
                key: "lines",
                label: "Credits in statement",
                value: String(lines.length),
                sub: formatINR(lines.reduce((a, l) => a + l.amountPaise, 0)),
              }}
            />
            <StatTile
              kpi={{
                key: "matched",
                label: "Matched",
                value: String(matched.length),
                sub: formatINR(matched.reduce((a, l) => a + l.amountPaise, 0)),
              }}
            />
            <StatTile
              kpi={{
                key: "open",
                label: "Need a person",
                value: String(open.length),
                status: open.length ? "critical" : "good",
              }}
            />
            <StatTile
              kpi={{
                key: "ignored",
                label: "Not fees",
                value: String(lines.filter((l) => l.matchStatus === "IGNORED").length),
              }}
            />
          </div>
          <div className="mb-6 overflow-hidden rounded-lg border border-line bg-elevated">
            <Table>
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th>Narration</Th>
                  <Th>Reference</Th>
                  <Th className="text-right">Credit</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th />
                </tr>
              </THead>
              <tbody>
                {lines.map((l) => (
                  <Tr key={l.id}>
                    <Td className="whitespace-nowrap tabular-nums">{formatDate(l.date)}</Td>
                    <Td className="max-w-xs truncate text-sm" title={l.description}>
                      {l.description}
                    </Td>
                    <Td className="font-mono text-xs">{l.reference ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{formatINR(l.amountPaise)}</Td>
                    <Td>
                      <Badge tone={TONE[l.matchStatus as keyof typeof TONE] ?? "neutral"}>
                        {l.matchStatus.toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="text-sm">
                      {l.payment ? (
                        <>
                          {l.payment.receipt?.number}
                          <span className="block text-xs text-muted">
                            {l.payment.student
                              ? `${l.payment.student.firstName} ${l.payment.student.lastName}`
                              : ""}{" "}
                            · {formatDate(l.payment.receivedAt)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <LineControls
                        lineId={l.id}
                        status={l.matchStatus}
                        suggestions={candidates
                          .filter((c) => c.amountPaise === l.amountPaise)
                          .sort(
                            (a, b) =>
                              Math.abs(a.receivedAt.getTime() - l.date.getTime()) -
                              Math.abs(b.receivedAt.getTime() - l.date.getTime()),
                          )
                          .slice(0, 6)
                          .map((c) => ({
                            id: c.id,
                            label: `${c.receipt?.number ?? "—"} · ${c.student ? `${c.student.firstName} ${c.student.lastName}` : ""} · ${formatDate(c.receivedAt, "d MMM")}`,
                          }))}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      ) : (
        <div className="mb-6">
          <EmptyState title="No statements imported yet">
            Download the sample statement above and import it to see matching in action.
          </EmptyState>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recorded, not yet seen in the bank</CardTitle>
          <span className="text-xs text-muted">
            Offline payments older than 3 days with no matching statement line
          </span>
        </CardHeader>
        {waiting.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Received</Th>
                <Th>Receipt</Th>
                <Th>Pupil</Th>
                <Th>Method · reference</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </THead>
            <tbody>
              {waiting.map((p) => (
                <Tr key={p.id}>
                  <Td className="tabular-nums">{formatDate(p.receivedAt)}</Td>
                  <Td>{p.receipt?.number}</Td>
                  <Td>{p.student ? `${p.student.firstName} ${p.student.lastName}` : "—"}</Td>
                  <Td className="text-sm text-muted">
                    {p.method.toLowerCase().replace("_", " ")} {p.reference ? `· ${p.reference}` : ""}
                  </Td>
                  <Td className="text-right tabular-nums">{formatINR(p.amountPaise)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardBody>
            <p className="text-sm text-muted">Everything recorded has been seen in a statement.</p>
          </CardBody>
        )}
      </Card>
    </>
  );
}
