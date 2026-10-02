import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { balances, LOW_BALANCE_PAISE } from "@/lib/services/imprest";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pocket money" };

/** Boarders' pocket-money balances, lowest first, so houseparents can ask families to top up in time. */
export default async function ImprestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("imprest:read");
  const sp = await searchParams;
  const [boarders, houses, year] = await Promise.all([
    db.student.findMany({
      where: {
        status: "ACTIVE",
        boardingType:
          sp.boarding === "FULL" || sp.boarding === "FLEXI" ? sp.boarding : { in: ["FULL", "FLEXI"] },
        ...(sp.house ? { houseId: sp.house } : {}),
        ...(sp.q
          ? {
              OR: [
                { firstName: { contains: sp.q, mode: "insensitive" } },
                { lastName: { contains: sp.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { class: true, house: true },
    }),
    db.house.findMany({ orderBy: { name: "asc" } }),
    db.academicYear.findFirstOrThrow({ where: { isCurrent: true }, include: { imprestPolicies: true } }),
  ]);
  const bal = await balances(boarders.map((b) => b.id));
  const rows = boarders
    .map((b) => ({ ...b, balance: bal.get(b.id)?.balance ?? 0, last: bal.get(b.id)?.last ?? null }))
    .filter((r) => sp.low !== "1" || r.balance < LOW_BALANCE_PAISE)
    .sort((a, b) => a.balance - b.balance);
  const total = rows.reduce((a, r) => a + r.balance, 0);
  const low = rows.filter((r) => r.balance < LOW_BALANCE_PAISE).length;
  const allowance = (t: string) =>
    year.imprestPolicies.find((p) => p.boardingType === t)?.amountPerTermPaise ?? 0;
  return (
    <>
      <PageHeader
        title="Pocket money"
        description={`Term allowance ${formatINR(allowance("FULL"))} for full and ${formatINR(allowance("FLEXI"))} for flexi boarders, credited each term and topped up by families online.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile kpi={{ key: "n", label: "Boarders", value: String(rows.length) }} />
        <StatTile
          kpi={{
            key: "held",
            label: "Held on their behalf",
            value: formatINR(total, { compact: true }),
            sub: formatINR(total),
          }}
        />
        <StatTile
          kpi={{
            key: "low",
            label: `Below ${formatINR(LOW_BALANCE_PAISE)}`,
            value: String(low),
            status: low ? "critical" : "good",
            href: "/admin/imprest?low=1",
          }}
        />
      </div>
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search boarders", placeholder: "Pupil name…" },
          {
            type: "select",
            name: "house",
            label: "House",
            options: houses.map((h) => ({ value: h.id, label: h.name })),
          },
          {
            type: "select",
            name: "boarding",
            label: "Boarding",
            options: [
              { value: "FULL", label: "Full" },
              { value: "FLEXI", label: "Flexi" },
            ],
          },
          {
            type: "select",
            name: "low",
            label: "Balance",
            options: [{ value: "1", label: "Low balances only" }],
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Pupil</Th>
                <Th>House</Th>
                <Th>Boarding</Th>
                <Th>Last activity</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/imprest/${r.id}`} className="font-medium hover:underline">
                      {r.firstName} {r.lastName}
                    </Link>
                    <span className="block text-xs text-muted">{r.class.name}</span>
                  </Td>
                  <Td>{r.house?.name ?? "—"}</Td>
                  <Td className="text-muted">{r.boardingType === "FULL" ? "Full" : "Flexi"}</Td>
                  <Td className="text-sm text-muted">{r.last ? formatDate(r.last) : "—"}</Td>
                  <Td
                    className={cn(
                      "text-right font-medium tabular-nums",
                      r.balance < LOW_BALANCE_PAISE && "text-danger",
                    )}
                  >
                    {formatINR(r.balance)}
                    {r.balance < LOW_BALANCE_PAISE && <span className="block text-xs font-normal">low</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No boarders match" />
          </div>
        )}
      </div>
    </>
  );
}
