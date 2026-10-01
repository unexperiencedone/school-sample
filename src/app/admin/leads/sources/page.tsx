import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dateRange } from "@/lib/crm/list";
import { sourceLabel } from "@/lib/services/leads";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";

export const metadata = { title: "Lead sources" };

type Row = { key: string; total: number; toured: number; applied: number; admitted: number; lost: number };

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

/** Source and UTM attribution with funnel conversion, by first touch. */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; by?: string }>;
}) {
  await requireStaff("leads:read");
  const sp = await searchParams;
  const by = (
    ["source", "utmSource", "utmCampaign", "utmMedium"].includes(sp.by ?? "") ? sp.by : "source"
  ) as "source" | "utmSource" | "utmCampaign" | "utmMedium";
  const created = dateRange(sp.from, sp.to);
  const leads = await db.lead.findMany({
    where: { mergedIntoId: null, ...(created ? { createdAt: created } : {}) },
    select: { source: true, utmSource: true, utmCampaign: true, utmMedium: true, status: true },
  });
  const map = new Map<string, Row>();
  for (const l of leads) {
    const key = l[by] ?? "(none)";
    const r = map.get(key) ?? { key, total: 0, toured: 0, applied: 0, admitted: 0, lost: 0 };
    r.total++;
    if (["TOUR_BOOKED", "TOUR_DONE", "APPLIED", "ADMITTED"].includes(l.status)) r.toured++;
    if (["APPLIED", "ADMITTED"].includes(l.status)) r.applied++;
    if (l.status === "ADMITTED") r.admitted++;
    if (l.status === "LOST") r.lost++;
    map.set(key, r);
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total);
  const total = rows.reduce((a, r) => a + r.total, 0);
  return (
    <>
      <PageHeader
        title="Lead sources"
        description="Which placements and campaigns bring families — and which of them actually apply and join."
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "select",
            name: "by",
            label: "Group by",
            options: [
              { value: "source", label: "Website placement" },
              { value: "utmSource", label: "UTM source" },
              { value: "utmMedium", label: "UTM medium" },
              { value: "utmCampaign", label: "UTM campaign" },
            ],
          },
          { type: "date", name: "from", label: "From" },
          { type: "date", name: "to", label: "To" },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <Table>
          <THead>
            <tr>
              <Th>
                {by === "source"
                  ? "Placement"
                  : { utmSource: "UTM source", utmMedium: "UTM medium", utmCampaign: "UTM campaign" }[by]}
              </Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Share</Th>
              <Th className="text-right">Toured</Th>
              <Th className="text-right">Applied</Th>
              <Th className="text-right">Admitted</Th>
              <Th className="text-right">Lead → admit</Th>
              <Th className="text-right">Lost</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td className="font-medium">{by === "source" ? sourceLabel(r.key) : r.key}</Td>
                <Td className="text-right tabular-nums">{r.total}</Td>
                <Td className="text-right text-muted tabular-nums">{pct(r.total, total)}</Td>
                <Td className="text-right tabular-nums">{r.toured}</Td>
                <Td className="text-right tabular-nums">{r.applied}</Td>
                <Td className="text-right tabular-nums">{r.admitted}</Td>
                <Td className="text-right font-medium tabular-nums">{pct(r.admitted, r.total)}</Td>
                <Td className="text-right text-muted tabular-nums">{r.lost}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
