import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { BAND_LABEL, BOARDING_LABEL, structureInclude } from "@/lib/services/fee-data";
import { revisionImpact } from "@/lib/services/fee-admin";
import { PageHeader } from "@/components/crm/page-header";
import { StatTile } from "@/components/charts/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { PublishPanel, RevisionEditor } from "./revision-controls";

export const metadata = { title: "Fee structure" };

const STATUS_TONE = { ACTIVE: "success", DRAFT: "accent", SUPERSEDED: "neutral" } as const;

function Delta({ paise }: { paise: number }) {
  if (paise === 0) return <span className="text-muted">—</span>;
  const Icon = paise > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium tabular-nums">
      <Icon className="size-3.5" aria-hidden />
      {formatINR(paise, { sign: true })}
    </span>
  );
}

export default async function StructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revise?: string }>;
}) {
  const user = await requireStaff("fees:read");
  const { id } = await params;
  const { revise } = await searchParams;
  const s = await db.feeStructure.findUnique({ where: { id }, include: { ...structureInclude, year: true } });
  if (!s) notFound();
  const versions = await db.feeStructure.findMany({
    where: { yearId: s.yearId, band: s.band, boardingType: s.boardingType },
    include: structureInclude,
    orderBy: { version: "desc" },
  });
  const authors = await db.user.findMany({
    where: { id: { in: versions.map((v) => v.createdById).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const active = versions.find((v) => v.status === "ACTIVE");
  const draft = versions.find((v) => v.status === "DRAFT");
  const canRevise = can(user.role, "fees:revise");
  const title = `${BAND_LABEL[s.band]} · ${BOARDING_LABEL[s.boardingType]}`;
  const lines = [...s.lines].sort((a, b) => a.feeHead.order - b.feeHead.order);
  const editing = canRevise && active && (s.status === "DRAFT" || (s.status === "ACTIVE" && revise === "1"));
  const impact = s.status === "DRAFT" ? await revisionImpact(s.id) : null;
  const heads = await db.feeHead.findMany({ where: { active: true }, orderBy: { order: "asc" } });

  return (
    <>
      <PageHeader
        eyebrow={`Fee structure · ${s.year.name}`}
        title={`${title} — v${s.version}`}
        description={s.reason ?? undefined}
        actions={
          <>
            <Badge tone={STATUS_TONE[s.status]}>{s.status.toLowerCase()}</Badge>
            <Link href={`/admin/fees?year=${s.year.name}`} className="text-sm text-muted underline">
              All structures
            </Link>
          </>
        }
      />

      {impact && (
        <section aria-labelledby="impact-title" className="mb-6 space-y-4">
          <h2 id="impact-title" className="font-serif text-xl">
            Impact of publishing v{s.version}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              kpi={{
                key: "inv",
                label: "Open invoices repriced",
                value: String(impact.summary.invoices),
                sub: `${impact.summary.paidInFull} fully paid invoices stay as issued`,
              }}
            />
            <StatTile
              kpi={{
                key: "delta",
                label: "Change in fees still to collect",
                value: formatINR(impact.summary.deltaPaise, { sign: true, compact: true }),
                sub: formatINR(impact.summary.deltaPaise, { sign: true }),
              }}
            />
            <StatTile
              kpi={{
                key: "credit",
                label: "Credits to families",
                value: formatINR(impact.summary.creditPaise, { compact: true }),
                sub: "Overpaid principal held on account",
              }}
            />
            <StatTile
              kpi={{
                key: "web",
                label: "Website fee pages",
                value: "Update on publish",
                sub: "Fee tables and PDF schedule",
              }}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card>
              <CardHeader>
                <CardTitle>Head by head</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <Th>Fee head</Th>
                    <Th className="text-right">v{impact.active.version} (live)</Th>
                    <Th className="text-right">v{s.version} (draft)</Th>
                    <Th className="text-right">Change</Th>
                  </tr>
                </THead>
                <tbody>
                  {impact.heads.map((h) => (
                    <Tr key={h.code}>
                      <Td>{h.name}</Td>
                      <Td className="text-right tabular-nums">{formatINR(h.oldPaise)}</Td>
                      <Td className="text-right font-medium tabular-nums">{formatINR(h.newPaise)}</Td>
                      <Td className="text-right">
                        <Delta paise={h.deltaPaise} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            {canRevise && (
              <Card>
                <CardHeader>
                  <CardTitle>Publish</CardTitle>
                </CardHeader>
                <CardBody>
                  <PublishPanel draftId={s.id} openInvoices={impact.summary.invoices} />
                </CardBody>
              </Card>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Invoices that would change</CardTitle>
              <span className="text-xs text-muted">
                Each recomputed with the family&apos;s own plan, concessions and payments
              </span>
            </CardHeader>
            {impact.invoices.length ? (
              <Table>
                <THead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Pupil</Th>
                    <Th className="text-right">Now</Th>
                    <Th className="text-right">Revised</Th>
                    <Th className="text-right">Change</Th>
                    <Th className="text-right">Credit</Th>
                  </tr>
                </THead>
                <tbody>
                  {impact.invoices
                    .sort((a, b) => Math.abs(b.deltaPaise) - Math.abs(a.deltaPaise))
                    .slice(0, 60)
                    .map((i) => (
                      <Tr key={i.id}>
                        <Td>
                          <Link href={`/admin/fees/invoices/${i.id}`} className="hover:underline">
                            {i.number}
                          </Link>
                        </Td>
                        <Td>
                          {i.student} <span className="text-xs text-muted">· {i.className}</span>
                        </Td>
                        <Td className="text-right tabular-nums">{formatINR(i.oldTotalPaise)}</Td>
                        <Td className="text-right font-medium tabular-nums">{formatINR(i.newTotalPaise)}</Td>
                        <Td className="text-right">
                          <Delta paise={i.deltaPaise} />
                        </Td>
                        <Td className="text-right tabular-nums">
                          {i.walletCreditPaise ? formatINR(i.walletCreditPaise) : "—"}
                        </Td>
                      </Tr>
                    ))}
                </tbody>
              </Table>
            ) : (
              <CardBody>
                <p className="text-sm text-muted">
                  No open invoices on the live version — publishing affects new invoices only.
                </p>
              </CardBody>
            )}
          </Card>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>
              {editing ? (s.status === "DRAFT" ? "Edit the draft" : "Draft a revision") : "Fee heads"}
            </CardTitle>
            {!editing && canRevise && s.status === "ACTIVE" && !draft && (
              <Link href={`?revise=1`} className="text-sm text-primary underline">
                Revise
              </Link>
            )}
          </CardHeader>
          <CardBody>
            {editing && active ? (
              <RevisionEditor
                activeId={active.id}
                heads={heads
                  .filter(
                    (h) =>
                      active.lines.some((l) => l.feeHeadId === h.id) ||
                      s.lines.some((l) => l.feeHeadId === h.id),
                  )
                  .map((h) => ({
                    id: h.id,
                    code: h.code,
                    name: h.name,
                    oneTime: h.oneTime,
                    currentPaise: active.lines.find((l) => l.feeHeadId === h.id)?.amountPaise ?? 0,
                    amountPaise:
                      (s.status === "DRAFT" ? s : active).lines.find((l) => l.feeHeadId === h.id)
                        ?.amountPaise ?? 0,
                  }))}
                defaultReason={s.status === "DRAFT" ? (s.reason ?? "") : ""}
                defaultEffectiveFrom={formatDate(
                  s.status === "DRAFT" ? s.effectiveFrom : new Date(),
                  "yyyy-MM-dd",
                )}
              />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="py-2">
                        {l.feeHead.name}
                        {l.feeHead.oneTime && <span className="ml-2 text-xs text-muted">one-time</span>}
                        {!l.feeHead.refundable && (
                          <span className="ml-2 text-xs text-muted">non-refundable</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatINR(l.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Version history</CardTitle>
          </CardHeader>
          <ol className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/fees/structures/${v.id}`}
                    className="font-medium hover:underline"
                    aria-current={v.id === s.id ? "page" : undefined}
                  >
                    v{v.version}
                  </Link>
                  <Badge tone={STATUS_TONE[v.status]}>{v.status.toLowerCase()}</Badge>
                </div>
                <p className="text-xs text-muted">
                  From {formatDate(v.effectiveFrom)} ·{" "}
                  {formatINR(
                    v.lines.filter((l) => !l.feeHead.oneTime).reduce((a, l) => a + l.amountPaise, 0),
                  )}{" "}
                  a year
                </p>
                {v.reason && <p className="mt-1 text-xs">{v.reason}</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {authors.find((a) => a.id === v.createdById)?.name ?? "Set up"} ·{" "}
                  {formatDateTime(v.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
