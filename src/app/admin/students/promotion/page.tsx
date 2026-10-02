import { requireStaff } from "@/lib/auth/session";
import { planPromotion } from "@/lib/services/students";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { StatTile } from "@/components/charts/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { promoteAction } from "../actions";

export const metadata = { title: "Year-end promotion" };
export const dynamic = "force-dynamic";

/** Preview first: who moves where. Tick "Exclude" for anyone repeating a year or leaving early, then run it once. */
export default async function PromotionPage() {
  await requireStaff("students:promote");
  const plan = await planPromotion();
  const byClass = new Map<string, typeof plan.rows>();
  for (const r of plan.rows) byClass.set(r.fromClass, [...(byClass.get(r.fromClass) ?? []), r]);
  const leavers = plan.rows.filter((r) => !r.toClass).length;
  const flagged = plan.rows.filter((r) => r.note && r.toClass).length;
  return (
    <>
      <PageHeader
        title="Year-end promotion"
        description={`Moves the ${plan.current.name} roll into ${plan.next.name}: same section in the next class where there is room, Year 13 leavers to alumnae. Nothing changes until you confirm.`}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile kpi={{ key: "move", label: "Move up", value: String(plan.rows.length - leavers) }} />
        <StatTile kpi={{ key: "leave", label: "Leave (Year 13)", value: String(leavers) }} />
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
        confirm={`Move ${plan.rows.length} pupils into ${plan.next.name}? This is recorded in the audit log.`}
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
                  <Th className="w-20">Exclude</Th>
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
                        aria-label={`Exclude ${r.name}`}
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
            <Button type="submit">Promote {plan.rows.length} pupils</Button>
          </CardBody>
        </Card>
      </ActionForm>
    </>
  );
}
