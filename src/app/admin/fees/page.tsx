import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BAND_LABEL, BAND_YEARS, BANDS, BOARDING_LABEL, structureInclude } from "@/lib/services/fee-data";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fee structures" };

/** Every band × boarding structure for a year: live version, annual total, drafts awaiting publication. */
export default async function StructuresPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireStaff("fees:read");
  const sp = await searchParams;
  const years = await db.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const current = years.find((y) => y.isCurrent)!;
  const year = years.find((y) => y.name === sp.year) ?? current;
  const structures = await db.feeStructure.findMany({
    where: { yearId: year.id },
    include: { ...structureInclude, _count: { select: { invoices: true } } },
    orderBy: [{ band: "asc" }, { boardingType: "asc" }, { version: "desc" }],
  });
  const openByStructure = await db.invoice.groupBy({
    by: ["structureId"],
    where: { yearId: year.id, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
    _count: true,
  });
  const groups = BANDS.flatMap((band) =>
    (["DAY", "FLEXI", "FULL"] as const)
      .map((boarding) => {
        const versions = structures.filter((s) => s.band === band && s.boardingType === boarding);
        const active = versions.find((v) => v.status === "ACTIVE");
        const draft = versions.find((v) => v.status === "DRAFT");
        return active ? { band, boarding, active, draft, versions } : null;
      })
      .filter((g) => g !== null),
  );
  const annual = (lines: (typeof structures)[number]["lines"]) =>
    lines.filter((l) => !l.feeHead.oneTime).reduce((a, l) => a + l.amountPaise, 0);
  const oneTime = (lines: (typeof structures)[number]["lines"]) =>
    lines.filter((l) => l.feeHead.oneTime).reduce((a, l) => a + l.amountPaise, 0);

  return (
    <>
      <PageHeader
        title="Fee structures"
        description="Versioned fee schedules by stage and boarding. A revision is drafted, its impact on every open invoice previewed, then published — the website and invoices update together."
      />
      <nav aria-label="Academic year" className="mb-4 flex gap-1">
        {years.map((y) => (
          <Link
            key={y.id}
            href={`/admin/fees?year=${y.name}`}
            aria-current={y.id === year.id ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              y.id === year.id ? "bg-primary text-primary-fg" : "text-muted hover:bg-sunken hover:text-fg",
            )}
          >
            {y.name}
            {y.isCurrent && <span className="ml-1 text-xs opacity-80">(current)</span>}
          </Link>
        ))}
      </nav>
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <Table>
          <THead>
            <tr>
              <Th>Stage</Th>
              <Th>Boarding</Th>
              <Th>Live version</Th>
              <Th className="text-right">Annual fees</Th>
              <Th className="text-right">One-time (new pupils)</Th>
              <Th className="text-right">Open invoices</Th>
              <Th>Revision</Th>
            </tr>
          </THead>
          <tbody>
            {groups.map((g) => (
              <Tr key={`${g.band}:${g.boarding}`}>
                <Td>
                  <span className="font-medium">{BAND_LABEL[g.band]}</span>
                  <span className="block text-xs text-muted">{BAND_YEARS[g.band]}</span>
                </Td>
                <Td>{BOARDING_LABEL[g.boarding]}</Td>
                <Td>
                  <Link
                    href={`/admin/fees/structures/${g.active.id}`}
                    className="font-medium hover:underline"
                  >
                    v{g.active.version}
                  </Link>
                  <span className="block text-xs text-muted">since {formatDate(g.active.effectiveFrom)}</span>
                </Td>
                <Td className="text-right font-medium tabular-nums">{formatINR(annual(g.active.lines))}</Td>
                <Td className="text-right text-muted tabular-nums">{formatINR(oneTime(g.active.lines))}</Td>
                <Td className="text-right tabular-nums">
                  {openByStructure.find((o) => o.structureId === g.active.id)?._count ?? 0}
                </Td>
                <Td>
                  {g.draft ? (
                    <Link
                      href={`/admin/fees/structures/${g.draft.id}`}
                      className="inline-flex items-center gap-2"
                    >
                      <Badge tone="accent">Draft v{g.draft.version}</Badge>
                      <span className="text-sm underline">Review</span>
                    </Link>
                  ) : can(user.role, "fees:revise") ? (
                    <Link
                      href={`/admin/fees/structures/${g.active.id}?revise=1`}
                      className="text-sm text-primary underline"
                    >
                      Revise
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Annual fees are the recurring heads before concessions; one-time heads (registration, admission) apply
        to new admissions only. Pupils&apos; actual invoices also reflect their plan, concessions and any
        advance-payment rebate.
      </p>
    </>
  );
}
