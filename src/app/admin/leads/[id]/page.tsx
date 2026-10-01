import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Mail, MessageCircle, Phone } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { assignableStaff } from "@/lib/services/leads-admin";
import {
  findDuplicates,
  LEAD_STATUS_FLOW,
  LEAD_STATUS_LABEL,
  leadRef,
  sourceLabel,
} from "@/lib/services/leads";
import { PageHeader } from "@/components/crm/page-header";
import { LeadStatusBadge, StageBadge } from "@/components/crm/badges";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ageOn, formatDate } from "@/lib/dates";
import {
  AssignControl,
  DoneButton,
  MergeButton,
  NoteForm,
  ReminderForm,
  StatusControl,
} from "./lead-controls";
import { BOARDING_OPTIONS } from "@/lib/schemas/common";

export const metadata = { title: "Lead" };

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("leads:read");
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      mergedInto: true,
      activities: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      bookings: { include: { slot: true }, orderBy: { createdAt: "desc" } },
      reminders: { where: { doneAt: null }, orderBy: { dueAt: "asc" } },
      applications: true,
    },
  });
  if (!lead) notFound();
  const [staff, duplicates] = await Promise.all([
    assignableStaff(),
    lead.mergedIntoId ? Promise.resolve([]) : findDuplicates(lead),
  ]);
  const canWrite = can(user.role, "leads:write");
  const digits = lead.phone.replace(/\D/g, "");
  const wa = `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;

  return (
    <>
      <PageHeader
        eyebrow={`Lead ${leadRef(lead)} · ${lead.type === "TOUR" ? "Tour booking" : "Enquiry"} via ${sourceLabel(lead.source)}`}
        title={lead.parentName}
        description={
          <>
            Received {formatDate(lead.createdAt, "d MMM yyyy, h:mm a")} · {lead.classApplying}
            {lead.childName ? ` · ${lead.childName}` : ""}
          </>
        }
        actions={
          canWrite && !lead.mergedIntoId ? (
            <div className="flex flex-wrap items-end gap-3">
              <StatusControl
                id={lead.id}
                status={lead.status}
                statuses={LEAD_STATUS_FLOW.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
              />
              <AssignControl
                id={lead.id}
                assignedToId={lead.assignedToId}
                staff={staff}
                disabled={!can(user.role, "leads:assign")}
              />
            </div>
          ) : (
            <LeadStatusBadge status={lead.status} />
          )
        }
      />
      {lead.mergedInto && (
        <p className="mb-4 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning">
          This lead was merged into{" "}
          <Link href={`/admin/leads/${lead.mergedInto.id}`} className="underline">
            {lead.mergedInto.parentName}
          </Link>
          .
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Contact & child</CardTitle>
              <div className="flex gap-2">
                <a
                  href={`tel:${lead.phone}`}
                  className="rounded-md border border-line p-2 hover:bg-sunken"
                  aria-label="Call"
                >
                  <Phone className="size-4" />
                </a>
                <a
                  href={`mailto:${lead.email}`}
                  className="rounded-md border border-line p-2 hover:bg-sunken"
                  aria-label="Email"
                >
                  <Mail className="size-4" />
                </a>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-line p-2 hover:bg-sunken"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="size-4" />
                </a>
              </div>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  ["Phone", lead.phone],
                  ["Email", lead.email],
                  ["Child", lead.childName ?? "—"],
                  [
                    "Date of birth",
                    lead.childDob
                      ? `${formatDate(lead.childDob)} (age ${ageOn(lead.childDob, new Date())})`
                      : "—",
                  ],
                  ["Class", lead.classApplying],
                  [
                    "Boarding",
                    BOARDING_OPTIONS.find((b) => b.value === lead.preferredBoarding)?.label ?? "—",
                  ],
                  ["Source", sourceLabel(lead.source)],
                  [
                    "UTM",
                    [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ") || "—",
                  ],
                  ["Landing page", lead.landingPage ?? "—"],
                  ["Referrer", lead.referrer ?? "—"],
                  ["Consent", lead.consentAt ? `Given ${formatDate(lead.consentAt)}` : "—"],
                  ["Lost reason", lead.lostReason ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="truncate" title={String(v)}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              {lead.message && (
                <p className="mt-4 rounded-md bg-sunken p-3 text-sm whitespace-pre-line">{lead.message}</p>
              )}
            </CardBody>
          </Card>

          {(lead.bookings.length > 0 || lead.applications.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Tours & applications</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                {lead.bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-muted" aria-hidden />
                      {formatDate(b.slot.startsAt, "EEE d MMM, h:mm a")} · {b.visitors} visitor
                      {b.visitors > 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted">{b.status.replace("_", " ").toLowerCase()}</span>
                  </div>
                ))}
                {lead.applications.map((a) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <Link href={`/admin/applications/${a.id}`} className="underline">
                      {a.ref} · {a.childFirstName} {a.childLastName}
                    </Link>
                    <StageBadge stage={a.stage} />
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody>
              {canWrite && (
                <div className="mb-5">
                  <NoteForm id={lead.id} />
                </div>
              )}
              <ol className="relative space-y-4 border-l border-line pl-5">
                {lead.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span
                      className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-damson-300"
                      aria-hidden
                    />
                    <p className="text-sm">{a.body}</p>
                    <p className="text-xs text-muted">
                      {a.kind.toLowerCase()} · {a.actor?.name ?? "System"} ·{" "}
                      {formatDate(a.createdAt, "d MMM, h:mm a")}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Follow-up</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {lead.reminders.length === 0 && <p className="text-sm text-muted">No open reminders.</p>}
              {lead.reminders.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 text-sm">
                  <span>
                    {r.title}
                    <span className={`block text-xs ${r.dueAt < new Date() ? "text-danger" : "text-muted"}`}>
                      Due {formatDate(r.dueAt, "d MMM")}
                    </span>
                  </span>
                  {canWrite && <DoneButton reminderId={r.id} />}
                </div>
              ))}
              {canWrite && <ReminderForm id={lead.id} />}
            </CardBody>
          </Card>
          {duplicates.length > 0 && (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle>Possible duplicates ({duplicates.length})</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3 text-sm">
                {duplicates.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/leads/${d.id}`} className="min-w-0 underline">
                      <span className="block truncate">{d.parentName}</span>
                      <span className="block text-xs text-muted">
                        {formatDate(d.createdAt)} · {sourceLabel(d.source)}
                      </span>
                    </Link>
                    <LeadStatusBadge status={d.status} />
                  </div>
                ))}
                {can(user.role, "leads:merge") && (
                  <MergeButton
                    keepId={lead.id}
                    mergeIds={duplicates.map((d) => d.id)}
                    label={`${duplicates.length} lead(s)`}
                  />
                )}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
