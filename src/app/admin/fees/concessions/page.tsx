import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { requestConcessionAction } from "../actions";
import { ConcessionDecision } from "./decision";

export const metadata = { title: "Concessions" };

const TYPE: Record<string, string> = {
  SIBLING: "Sibling",
  STAFF_WARD: "Staff ward",
  SCHOLARSHIP: "Scholarship",
  FOUNDING_FAMILY: "Founding family",
  CUSTOM: "Bursary / other",
};

/** Concession rules, the approval queue (maker–checker) and requests. Approval reprices the open invoice. */
export default async function ConcessionsPage() {
  const user = await requireStaff("fees:read");
  const [concessions, queue, recent, students, year, auditRows] = await Promise.all([
    db.concession.findMany({
      orderBy: { priority: "asc" },
      include: { _count: { select: { students: { where: { status: "APPROVED" } } } } },
    }),
    db.studentConcession.findMany({
      where: { status: "REQUESTED" },
      include: { concession: true, year: true, student: { include: { class: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.studentConcession.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { not: null } },
      include: { concession: true, student: true },
      orderBy: { decidedAt: "desc" },
      take: 12,
    }),
    db.student.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECTIVE"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        class: { select: { name: true, order: true } },
      },
      orderBy: [{ class: { order: "asc" } }, { firstName: "asc" }],
    }),
    db.academicYear.findFirstOrThrow({ where: { isCurrent: true } }),
    db.auditLog.findMany({
      where: { action: "concession.request" },
      select: { entityId: true, actor: { select: { id: true, name: true } } },
    }),
  ]);
  const requester = (id: string) => auditRows.find((a) => a.entityId === id)?.actor;
  const byClass = new Map<string, typeof students>();
  for (const s of students) byClass.set(s.class.name, [...(byClass.get(s.class.name) ?? []), s]);
  const canApprove = can(user.role, "concessions:approve");

  return (
    <>
      <PageHeader
        title="Concessions"
        description="Sibling, staff and founding-family discounts apply automatically when a pupil is eligible. Scholarships and bursaries need approval by someone other than the person who requested them."
      />
      <section aria-labelledby="queue-title" className="mb-6">
        <h2 id="queue-title" className="mb-3 font-serif text-xl">
          Awaiting a decision <span className="text-base text-muted">({queue.length})</span>
        </h2>
        <div className="overflow-hidden rounded-lg border border-line bg-elevated">
          {queue.length ? (
            <Table>
              <THead>
                <tr>
                  <Th>Pupil</Th>
                  <Th>Concession</Th>
                  <Th>Value</Th>
                  <Th>Reason</Th>
                  <Th>Requested</Th>
                  {canApprove && <Th />}
                </tr>
              </THead>
              <tbody>
                {queue.map((q) => {
                  const who = requester(q.id);
                  return (
                    <Tr key={q.id}>
                      <Td>
                        <Link
                          href={`/admin/fees/invoices?student=${q.studentId}`}
                          className="font-medium hover:underline"
                        >
                          {q.student.firstName} {q.student.lastName}
                        </Link>
                        <span className="block text-xs text-muted">
                          {q.student.class.name} · {q.year.name}
                        </span>
                      </Td>
                      <Td>{q.concession.name}</Td>
                      <Td className="tabular-nums">
                        {q.overrideBp != null
                          ? `${q.overrideBp / 100}% (override)`
                          : q.concession.valueType === "PERCENT"
                            ? `${(q.concession.valueBp ?? 0) / 100}%`
                            : formatINR(q.concession.valuePaise ?? 0)}
                      </Td>
                      <Td className="max-w-xs text-sm">{q.reason ?? "—"}</Td>
                      <Td className="text-sm text-muted">
                        {formatDate(q.createdAt)}
                        {who && <span className="block">by {who.name}</span>}
                      </Td>
                      {canApprove && (
                        <Td>
                          {who?.id === user.id ? (
                            <span className="text-xs text-muted">Needs another approver</span>
                          ) : (
                            <ConcessionDecision id={q.id} />
                          )}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState title="Nothing waiting">New requests appear here for the Principal.</EmptyState>
            </div>
          )}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <span className="text-xs text-muted">Applied in priority order on what remains</span>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>#</Th>
                <Th>Concession</Th>
                <Th>Value</Th>
                <Th>On</Th>
                <Th>How</Th>
                <Th className="text-right">Pupils</Th>
              </tr>
            </THead>
            <tbody>
              {concessions.map((c) => (
                <Tr key={c.id}>
                  <Td className="text-muted tabular-nums">{c.priority}</Td>
                  <Td>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">
                      {TYPE[c.type] ?? c.type} · {c.code}
                    </span>
                  </Td>
                  <Td className="tabular-nums">
                    {c.valueType === "PERCENT" ? `${(c.valueBp ?? 0) / 100}%` : formatINR(c.valuePaise ?? 0)}
                  </Td>
                  <Td className="text-xs text-muted">{c.appliesTo.map((k) => k.toLowerCase()).join(", ")}</Td>
                  <Td className="space-x-1">
                    {c.automatic ? (
                      <Badge tone="info">automatic</Badge>
                    ) : (
                      <Badge tone="accent">on approval</Badge>
                    )}
                    {!c.stackable && <Badge tone="neutral">exclusive</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">{c._count.students || "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-5">
          {can(user.role, "concessions:request") && (
            <Card>
              <CardHeader>
                <CardTitle>Request a concession</CardTitle>
              </CardHeader>
              <CardBody>
                <ActionForm action={requestConcessionAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="yearId" value={year.id} />
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">Pupil</span>
                    <Select name="studentId" required defaultValue="">
                      <option value="" disabled>
                        Choose a pupil…
                      </option>
                      {[...byClass.entries()].map(([cls, list]) => (
                        <optgroup key={cls} label={cls}>
                          {list.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.firstName} {s.lastName} ({s.admissionNo})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">Concession</span>
                    <Select name="concessionId" required>
                      {concessions
                        .filter((c) => !c.automatic && c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      Override value (%) — optional
                    </span>
                    <Input name="overridePercent" inputMode="decimal" placeholder="Use the rule's value" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">Reason</span>
                    <Input
                      name="reason"
                      required
                      minLength={5}
                      placeholder="e.g. Music scholarship, audition 12 Sep"
                    />
                  </label>
                  <Button type="submit" size="sm">
                    Send for approval
                  </Button>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Recent decisions</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <span>
                    {r.student.firstName} {r.student.lastName}
                    <span className="block text-xs text-muted">
                      {r.concession.name} · {formatDate(r.decidedAt!)}
                    </span>
                  </span>
                  <Badge tone={r.status === "APPROVED" ? "success" : "danger"}>
                    {r.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
