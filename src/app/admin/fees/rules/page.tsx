import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { refundPolicy } from "@/lib/services/fee-data";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateLateFeeAction, updateRebateAction, updateRefundPolicyAction } from "../actions";

export const metadata = { title: "Plans & rules" };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Instalment plans, the late-fee rule, the advance-payment rebate and the refund policy — the levers of the engine. */
export default async function RulesPage() {
  const user = await requireStaff("fees:read");
  const editable = can(user.role, "fees:revise");
  const [years, rule, policy] = await Promise.all([
    db.academicYear.findMany({
      where: { endDate: { gte: new Date() } },
      orderBy: { startDate: "asc" },
      include: {
        instalmentPlans: { include: { parts: { orderBy: { seq: "asc" } } }, orderBy: { code: "asc" } },
        rebates: true,
      },
    }),
    db.lateFeeRule.findFirst({ where: { active: true } }),
    refundPolicy(),
  ]);
  const order = ["ONE", "TWO", "THREE"];
  return (
    <>
      <PageHeader
        title="Plans & rules"
        description="How invoices are split, when late fees start, who earns the advance-payment rebate and what a withdrawal refunds. Every change is audit-logged with its reason."
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {years.map((y) => (
          <Card key={y.id}>
            <CardHeader>
              <CardTitle>Instalment plans · {y.name}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {[...y.instalmentPlans]
                .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
                .map((p) => (
                  <div key={p.id}>
                    <p className="text-sm font-medium">{p.name}</p>
                    <ul className="mt-1 text-sm text-muted">
                      {p.parts.map((part) => (
                        <li
                          key={part.id}
                          className="flex justify-between gap-3 border-b border-line py-1 last:border-0"
                        >
                          <span>{part.label}</span>
                          <span className="tabular-nums">
                            {part.percentBp != null
                              ? `${part.percentBp / 100}%`
                              : formatINR(part.fixedPaise ?? 0)}{" "}
                            · due {formatDate(part.dueDate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              {y.rebates.map((r) => (
                <div key={r.id} className="rounded-md bg-sunken p-3">
                  <p className="text-sm font-medium">Advance-payment rebate</p>
                  <p className="text-sm text-muted">
                    {formatINR(r.amountPaise)} off the annual plan if paid in full by{" "}
                    {formatDate(r.payByDate)}. {r.active ? "Active." : "Switched off."} Forfeited
                    automatically by the nightly job if unpaid by then.
                  </p>
                  {editable && (
                    <ActionForm
                      action={updateRebateAction.bind(null, r.id)}
                      className="mt-3 grid gap-2 sm:grid-cols-3"
                    >
                      <Field label="Amount (₹)">
                        <Input
                          name="amount"
                          defaultValue={String(r.amountPaise / 100)}
                          inputMode="decimal"
                          required
                        />
                      </Field>
                      <Field label="Pay by">
                        <Input
                          type="date"
                          name="payByDate"
                          defaultValue={r.payByDate.toISOString().slice(0, 10)}
                          required
                        />
                      </Field>
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={r.active} className="size-4" />{" "}
                        Active
                      </label>
                      <div className="sm:col-span-2">
                        <Field label="Reason">
                          <Input name="reason" required minLength={5} />
                        </Field>
                      </div>
                      <div className="flex items-end">
                        <Button type="submit" size="sm" variant="outline">
                          Save rebate
                        </Button>
                      </div>
                    </ActionForm>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        ))}

        {rule && (
          <Card>
            <CardHeader>
              <CardTitle>Late fee</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-muted">
                {rule.ratePerMonthBp / 100}% of the unpaid principal for each started month overdue, after{" "}
                {rule.graceDays} days&apos; grace. Never charged on late fees, never lowered once charged,
                waivable with a reason.
                {rule.cancelFlagAfterDays
                  ? ` Invoices overdue more than ${rule.cancelFlagAfterDays} days are flagged for review — seats are never cancelled automatically.`
                  : ""}
              </p>
              {editable && (
                <ActionForm action={updateLateFeeAction} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Field label="Rate per month (%)">
                    <Input
                      name="ratePercent"
                      defaultValue={String(rule.ratePerMonthBp / 100)}
                      inputMode="decimal"
                      required
                    />
                  </Field>
                  <Field label="Grace (days)">
                    <Input
                      name="graceDays"
                      defaultValue={String(rule.graceDays)}
                      inputMode="numeric"
                      required
                    />
                  </Field>
                  <Field label="Flag after (days)" hint="Blank: never flag">
                    <Input
                      name="cancelFlagAfterDays"
                      defaultValue={rule.cancelFlagAfterDays ? String(rule.cancelFlagAfterDays) : ""}
                      inputMode="numeric"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Reason">
                      <Input name="reason" required minLength={5} />
                    </Field>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" size="sm" variant="outline">
                      Save rule
                    </Button>
                  </div>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Refund policy</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted">
              New pupils: {policy.newPupil.beforeStartBp / 100}% of refundable fees if they withdraw before
              the session starts, {policy.newPupil.afterStartBp / 100}% after. Existing pupils: the unconsumed
              share of the year, less {policy.existingPupil.inLieuOfNoticeBp / 100}% in lieu of notice if
              fewer than {policy.existingPupil.noticeDays} days&apos; written notice is given. Registration
              and admission fees are never refunded. Published on the fee pages.
            </p>
            {editable && (
              <ActionForm action={updateRefundPolicyAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="New pupil, before start (%)">
                  <Input
                    name="beforeStart"
                    defaultValue={String(policy.newPupil.beforeStartBp / 100)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="New pupil, after start (%)">
                  <Input
                    name="afterStart"
                    defaultValue={String(policy.newPupil.afterStartBp / 100)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Notice period (days)">
                  <Input
                    name="noticeDays"
                    defaultValue={String(policy.existingPupil.noticeDays)}
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field label="In lieu of notice (%)">
                  <Input
                    name="inLieu"
                    defaultValue={String(policy.existingPupil.inLieuOfNoticeBp / 100)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Reason">
                    <Input name="reason" required minLength={5} />
                  </Field>
                </div>
                <div>
                  <Button type="submit" size="sm" variant="outline">
                    Save policy
                  </Button>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
