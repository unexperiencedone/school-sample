import { requireStaff } from "@/lib/auth/session";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { planPromotion } from "@/lib/services/students";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { StatTile } from "@/components/charts/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { promoteAction } from "../actions";

export const metadata = { title: "Year-end promotion" };
export const dynamic = "force-dynamic";

/** Preview first: who moves where. Tick "Repeat" for anyone staying in her class next year, then run it once. */
export default async function PromotionPage() {
  await requireStaff("students:promote");
  const plan = await planPromotion().catch((e) => {
    if (e instanceof ApiError && e.code === "NO_NEXT_YEAR") return null;
    throw e;
  });
  if (!plan)
    return (
      <>
        <PageHeader title="Year-end promotion" description="Moves the roll into next year." />
        <EmptyState
          title="Next year isn't set up yet"
          action={
            <Link href="/admin/academics/years" className="underline">
              Set up academic years
            </Link>
          }
        >
          Create next year&apos;s academic year and its sections, then come back to preview the move.
        </EmptyState>
      </>
    );
  const byClass = new Map<string, typeof plan.rows>();
  for (const r of plan.rows) byClass.set(r.fromClass, [...(byClass.get(r.fromClass) ?? []), r]);
  const leavers = plan.rows.filter((r) => !r.toClass).length;
  const flagged = plan.rows.filter((r) => r.note && r.toClass).length;
  const blocked = plan.rows.filter((r) => r.toClass && !r.toSectionId).length;
  const movable = plan.rows.length - blocked;
  return (
    <>
      <PageHeader
        title="Year-end promotion"
        description={`Moves the ${plan.current.name} roll into ${plan.next.name}: same section in the next class where there is room, Year 13 leavers to alumnae. Nothing changes until you confirm.`}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile kpi={{ key: "move", label: "Move up", value: String(movable - leavers) }} />
        <StatTile kpi={{ key: "leave", label: "Leave (Year 13)", value: String(leavers) }} />
        <StatTile
          kpi={{
            key: "blocked",
            label: "Blocked",
            value: String(blocked),
            sub: "No section next year",
            status: blocked ? "critical" : "good",
          }}
        />
        <StatTile
          kpi={{
            key: "flag",
            label: "Need a look",
            value: String(flagged),
            sub: "Section change or over capacity",
            status: flagged ? "critical" : "good",
          }}
        />
        <StatTile
          kpi={{ key: "done", label: "Already placed", value: String(plan.skipped), sub: "Skipped" }}
        />
      </div>
      <ActionForm
        action={promoteAction}
        confirm={`Move ${movable} pupils into ${plan.next.name}? Anyone ticked "Repeat" stays in her class. This is recorded in the audit log.`}
        redirectTo="/admin/students"
        className="space-y-5"
      >
        {[...byClass.entries()].map(([cls, rows]) => (
          <Card key={cls}>
            <CardHeader>
              <CardTitle>
                {cls} → {rows[0]?.toClass ?? "leaving"}
              </CardTitle>
              <span className="text-xs text-muted">{rows.length} pupils</span>
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <Th className="w-20">Repeat</Th>
                  <Th>Pupil</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Note</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.studentId}>
                    <Td>
                      <input
                        type="checkbox"
                        name="exclude"
                        value={r.studentId}
                        className="size-4"
                        aria-label={`Repeat the year: ${r.name}`}
                      />
                    </Td>
                    <Td>
                      {r.name} <span className="text-xs text-muted">{r.admissionNo}</span>
                    </Td>
                    <Td>
                      {r.fromClass} {r.fromSection}
                    </Td>
                    <Td>{r.toClass ? `${r.toClass} ${r.toSection ?? "—"}` : "Alumna"}</Td>
                    <Td className="text-xs text-muted">{r.note}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <label className="min-w-72 flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Reason (recorded)</span>
              <Input
                name="reason"
                required
                minLength={5}
                defaultValue={`Year-end promotion into ${plan.next.name}`}
              />
            </label>
            <Button type="submit">Promote {movable} pupils</Button>
          </CardBody>
        </Card>
      </ActionForm>
    </>
  );
}
