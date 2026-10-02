import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, HeartPulse, IdCard, Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { initials } from "@/lib/utils";
import { studentProfile } from "@/lib/services/students";
import { BOARDING_LABEL } from "@/lib/services/fee-data";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { FeeStatusBadge } from "@/components/crm/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { updateStudentAction, withdrawStudentAction } from "../actions";

export const metadata = { title: "Student" };

const REQUEST_LABEL: Record<string, string> = {
  WITHDRAWAL: "Withdrawal notice",
  CONCESSION: "Concession request",
  PROFILE_UPDATE: "Profile update",
  IMPREST_TOPUP: "Pocket-money top-up",
};

function Consent({ on, label }: { on: boolean; label: string }) {
  return <Badge tone={on ? "success" : "neutral"}>{`${label} ${on ? "on" : "off"}`}</Badge>;
}

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("students:read");
  const { id } = await params;
  const s = await studentProfile(id);
  if (!s) notFound();
  const [houses, sections] = await Promise.all([
    db.house.findMany({ orderBy: { name: "asc" } }),
    db.section.findMany({
      // sections of the year she is placed in (next year's, right after promotion), else the current year
      where: {
        classId: s.classId,
        ...(s.section ? { yearId: s.section.yearId } : { year: { isCurrent: true } }),
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const canWrite = can(user.role, "students:write");
  const seesFees = can(user.role, "fees:read");
  const onRoll = s.status === "ACTIVE" || s.status === "PROSPECTIVE";
  return (
    <>
      <PageHeader
        eyebrow={`${s.admissionNo} · ${s.status === "PROSPECTIVE" ? "joining" : s.status.toLowerCase()}`}
        title={`${s.firstName} ${s.lastName}`}
        description={`${s.class.name}${s.section ? ` ${s.section.name}` : ""} · ${BOARDING_LABEL[s.boardingType]}${s.house ? ` · ${s.house.name} house` : ""} · ${s.age} years old`}
        actions={
          <>
            <a
              href={`/api/admin/students/${s.id}/id-card`}
              target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
            >
              <IdCard className="size-4" aria-hidden /> ID card
            </a>
            {can(user.role, "payments:record") && s.outstanding > 0 && (
              <Link
                href={`/admin/payments/new?student=${s.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                <CreditCard className="size-4" aria-hidden /> Record payment
              </Link>
            )}
          </>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Family</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line">
              {s.guardians.map((g) => (
                <li key={g.guardianId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <span className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold"
                    >
                      {initials(g.guardian.name)}
                    </span>
                    <span className="text-sm">
                      <span className="font-medium">{g.guardian.name}</span>{" "}
                      <span className="text-muted">· {g.relation}</span>
                      {g.isPrimary && <span className="ml-1 text-xs text-muted">(primary)</span>}
                      <span className="block text-muted">
                        {g.guardian.phone}
                        {g.guardian.email && ` · ${g.guardian.email}`}
                      </span>
                      {g.guardian.occupation && (
                        <span className="block text-xs text-muted">{g.guardian.occupation}</span>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Consent on={g.guardian.emailOptIn} label="Email" />
                    <Consent on={g.guardian.whatsappOptIn} label="WhatsApp" />
                    <Consent on={g.guardian.smsOptIn} label="SMS" />
                    {g.guardian.userId && <Badge tone="info">portal</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            {s.siblings.length > 0 && (
              <CardBody className="border-t border-line text-sm">
                <span className="text-muted">Siblings: </span>
                {s.siblings.map((x, k) => (
                  <span key={x.id}>
                    {k > 0 && ", "}
                    <Link href={`/admin/students/${x.id}`} className="underline">
                      {x.firstName}
                    </Link>{" "}
                    <span className="text-muted">
                      ({x.class.name}
                      {x.status !== "ACTIVE" ? `, ${x.status.toLowerCase()}` : ""})
                    </span>
                  </span>
                ))}
              </CardBody>
            )}
          </Card>

          {seesFees && (
            <Card>
              <CardHeader>
                <CardTitle>Fees</CardTitle>
                <span className="text-sm">
                  Outstanding <span className="font-semibold tabular-nums">{formatINR(s.outstanding)}</span>
                  {s.walletBalance !== 0 && (
                    <span className="ml-3 text-success">Credit {formatINR(s.walletBalance)}</span>
                  )}
                </span>
              </CardHeader>
              <ul className="divide-y divide-line text-sm">
                {s.invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/admin/fees/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.number}
                    </Link>
                    <span className="text-muted">{inv.year.name}</span>
                    <span className="tabular-nums">
                      {formatINR(inv.paidPaise)} of {formatINR(inv.totalPaise + inv.lateFeePaise)}
                    </span>
                    <FeeStatusBadge status={inv.status} />
                  </li>
                ))}
              </ul>
              {s.concessions.length > 0 && (
                <CardBody className="border-t border-line text-sm">
                  <span className="text-muted">Concessions: </span>
                  {s.concessions
                    .map((c) => `${c.concession.name} (${c.year.name}, ${c.status.toLowerCase()})`)
                    .join(" · ")}
                </CardBody>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>School record</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
              <dl className="space-y-1.5">
                {[
                  ["Date of birth", formatDate(s.dob)],
                  ["Admitted", formatDate(s.admittedOn)],
                  [
                    "Form tutor",
                    s.section?.classTeacher
                      ? `${s.section.classTeacher.firstName} ${s.section.classTeacher.lastName}`
                      : "—",
                  ],
                  ["Room", s.section?.room ?? "—"],
                  ...(s.leftOn ? [["Left", formatDate(s.leftOn)]] : []),
                  ...(s.isFoundingFamily ? [["Family", "Founding family"]] : []),
                  ...(s.isStaffWard ? [["Family", "Staff ward"]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="mb-1 text-muted">Class history</p>
                <ol className="space-y-1">
                  {s.history.map((h) => (
                    <li key={h.id}>
                      {h.year.name}: {h.class.name}
                      {h.section ? ` ${h.section.name}` : ""}{" "}
                      {h.outcome && <span className="text-xs text-muted">({h.outcome.toLowerCase()})</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </CardBody>
            {s.application && (
              <CardBody className="border-t border-line text-sm">
                Joined through application{" "}
                <Link href={`/admin/applications/${s.application.id}`} className="underline">
                  {s.application.ref}
                </Link>{" "}
                · {s.application.documents.filter((d) => d.status === "VERIFIED").length} verified documents
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Medical</CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              {can(user.role, "students:medical") ? (
                <Link
                  href={`/admin/students/${s.id}/medical`}
                  prefetch={false}
                  className="inline-flex items-center gap-1.5 text-primary underline"
                >
                  <HeartPulse className="size-4" aria-hidden /> Open medical record
                </Link>
              ) : (
                <p className="flex items-center gap-2 text-muted">
                  <Lock className="size-4" aria-hidden /> Restricted to the Registrar, houseparents and the
                  Principal.
                </p>
              )}
              <p className="mt-2 text-xs text-muted">Every view is recorded in the audit log.</p>
            </CardBody>
          </Card>
          {s.boardingType !== "DAY" && can(user.role, "imprest:read") && (
            <Card>
              <CardHeader>
                <CardTitle>Pocket money</CardTitle>
                <Link href={`/admin/imprest/${s.id}`} className="text-xs text-primary underline">
                  Ledger
                </Link>
              </CardHeader>
              <CardBody className="text-2xl font-semibold tabular-nums">
                {formatINR(s.imprestBalance)}
              </CardBody>
            </Card>
          )}
          {s.requests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Requests from the family</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-line text-sm">
                {s.requests.map((r) => (
                  <li key={r.id} className="px-5 py-2.5">
                    {REQUEST_LABEL[r.kind]}{" "}
                    <span className="text-xs text-muted">
                      · {formatDate(r.createdAt)} · {r.status.toLowerCase().replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {canWrite && onRoll && (
            <Card>
              <CardHeader>
                <CardTitle>Edit details</CardTitle>
              </CardHeader>
              <CardBody>
                <ActionForm action={updateStudentAction.bind(null, s.id)} className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-xs text-muted">First name</span>
                      <Input name="firstName" defaultValue={s.firstName} required />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">Last name</span>
                      <Input name="lastName" defaultValue={s.lastName} required />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">Section</span>
                    <Select name="sectionId" defaultValue={s.sectionId ?? ""}>
                      <option value="">—</option>
                      {sections.map((x) => (
                        <option key={x.id} value={x.id}>
                          {s.class.name} {x.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-xs text-muted">House</span>
                      <Select name="houseId" defaultValue={s.houseId ?? ""}>
                        <option value="">—</option>
                        {houses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">Boarding</span>
                      <Select name="boardingType" defaultValue={s.boardingType}>
                        <option value="DAY">Day</option>
                        {s.class.order >= 4 && <option value="FLEXI">Flexi</option>}
                        {s.class.order >= 6 && <option value="FULL">Full</option>}
                      </Select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">Reason for the change</span>
                    <Input name="reason" required minLength={5} />
                  </label>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          {canWrite && onRoll && (
            <Card>
              <CardHeader>
                <CardTitle>Withdrawal or transfer</CardTitle>
              </CardHeader>
              <CardBody>
                <ActionForm
                  action={withdrawStudentAction.bind(null, s.id)}
                  confirm={`Take ${s.firstName} off the roll? This releases the seat.`}
                  className="space-y-3 text-sm"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">Type</span>
                    <Select name="kind" defaultValue="WITHDRAWN">
                      <option value="WITHDRAWN">Withdrawn by the family</option>
                      <option value="TRANSFERRED">Transferred to another school</option>
                    </Select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-xs text-muted">Last day</span>
                      <Input type="date" name="leftOn" required />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">Going to (optional)</span>
                      <Input name="destination" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">Reason</span>
                    <Input name="reason" required minLength={5} />
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    Record
                  </Button>
                  <p className="text-xs text-muted">
                    Fee settlement and any refund are handled separately by Accounts.
                  </p>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
