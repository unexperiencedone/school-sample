import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { STAGE_LABEL, TRANSITIONS } from "@/lib/services/admissions";
import { downloadUrlFor } from "@/lib/services/uploads";
import { PageHeader } from "@/components/crm/page-header";
import { StageBadge } from "@/components/crm/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ageOn, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { DOCUMENT_KINDS } from "@/lib/schemas/registration";
import { AssessmentForm, DocumentActions, StageActions } from "./stage-actions";
import { sourceLabel } from "@/lib/services/leads";

export const metadata = { title: "Application" };

type GuardianJson = {
  relation: string;
  name: string;
  occupation?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("applications:read");
  const { id } = await params;
  const app = await db.application.findUnique({
    where: { id },
    include: {
      class: true,
      startYear: true,
      lead: true,
      documents: true,
      events: { orderBy: { createdAt: "desc" } },
      payments: { include: { receipt: true } },
      student: {
        include: {
          invoices: {
            include: { instalments: { orderBy: { seq: "asc" } } },
            where: { status: { not: "VOID" } },
          },
        },
      },
    },
  });
  if (!app) notFound();
  const [actors, sections] = await Promise.all([
    db.user.findMany({
      where: { id: { in: app.events.map((e) => e.actorId).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    }),
    db.section.findMany({
      where: { classId: app.classId, yearId: app.startYearId },
      include: { _count: { select: { students: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const docLinks = await Promise.all(
    app.documents.map(async (d) => [d.kind, d.fileKey ? await downloadUrlFor(d.fileKey) : null] as const),
  );
  const scores = (app.assessmentScores ?? {}) as Record<string, string | number | undefined>;
  const guardians = app.guardians as GuardianJson[];
  const canWrite = can(user.role, "applications:write");
  const invoice = app.student?.invoices[0];
  const atLocal = app.assessmentAt ? formatDate(app.assessmentAt, "yyyy-MM-dd'T'HH:mm") : null;

  return (
    <>
      <PageHeader
        eyebrow={`Application ${app.ref} · ${app.startYear.name}`}
        title={`${app.childFirstName} ${app.childLastName}`}
        description={
          <>
            {app.class.name} · {app.boardingType.toLowerCase()} boarding · age {ageOn(app.dob, new Date())}
            {app.scholarshipInterest && " · scholarship interest"}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StageBadge stage={app.stage} />
            {app.offerIssuedAt && (
              <a
                href={`/api/admin/applications/${app.id}/offer-letter`}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-sm hover:bg-sunken"
                target="_blank"
              >
                <FileText className="size-4" aria-hidden /> Offer letter
              </a>
            )}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Next step</CardTitle>
                <span className="text-xs text-muted">Currently: {STAGE_LABEL[app.stage]}</span>
              </CardHeader>
              <CardBody>
                <StageActions
                  id={app.id}
                  allowed={TRANSITIONS[app.stage].filter((t) => t !== "REGISTERED")}
                  canDecide={can(user.role, "applications:decide")}
                  sections={sections.map((s) => ({
                    id: s.id,
                    name: `${app.class.name} ${s.name}`,
                    count: s._count.students,
                    capacity: s.capacity,
                  }))}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <span className="text-xs text-muted">
                {app.documents.filter((d) => d.status === "VERIFIED").length} of 4 verified
              </span>
            </CardHeader>
            <CardBody className="divide-y divide-line p-0">
              {DOCUMENT_KINDS.map((k) => {
                const d = app.documents.find((x) => x.kind === k.kind);
                const link = docLinks.find(([kind]) => kind === k.kind)?.[1];
                return (
                  <div
                    key={k.kind}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{k.label}</p>
                      <p className="text-xs text-muted">
                        {d?.fileName ? (
                          link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                              {d.fileName}
                            </a>
                          ) : (
                            d.fileName
                          )
                        ) : (
                          "Not uploaded yet"
                        )}
                        {d?.note && ` · ${d.note}`}
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={
                          d?.status === "VERIFIED"
                            ? "success"
                            : d?.status === "REJECTED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {d?.fileKey
                          ? d.status === "PENDING"
                            ? "To check"
                            : d.status.toLowerCase()
                          : "missing"}
                      </Badge>
                      {canWrite && d?.fileKey && d.status !== "VERIFIED" && <DocumentActions docId={d.id} />}
                    </span>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment & review</CardTitle>
              {app.assessmentAt && (
                <span className="text-xs text-muted">
                  {formatDate(app.assessmentAt, "EEE d MMM, h:mm a")}
                </span>
              )}
            </CardHeader>
            <CardBody>
              {canWrite ? (
                <AssessmentForm
                  id={app.id}
                  at={atLocal}
                  scores={scores}
                  reviewNotes={app.reviewNotes ?? ""}
                />
              ) : (
                <p className="text-sm text-muted">
                  {Object.keys(scores).length ? JSON.stringify(scores) : "No scores yet."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {app.events.map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span
                      className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-marigold-500"
                      aria-hidden
                    />
                    <p>
                      {e.fromStage && e.fromStage !== e.toStage
                        ? `${STAGE_LABEL[e.fromStage]} → ${STAGE_LABEL[e.toStage]}`
                        : STAGE_LABEL[e.toStage]}
                      {e.note && <span className="text-muted"> — {e.note}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {actors.find((a) => a.id === e.actorId)?.name ?? "System"} ·{" "}
                      {formatDate(e.createdAt, "d MMM yyyy, h:mm a")}
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
              <CardTitle>Family</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4 text-sm">
              {guardians.map((g) => (
                <div key={g.relation + g.name}>
                  <p className="font-medium">
                    {g.name} <span className="text-xs text-muted">({g.relation})</span>
                  </p>
                  <p className="text-muted">{[g.occupation, g.phone, g.email].filter(Boolean).join(" · ")}</p>
                  {g.address && <p className="text-xs text-muted">{g.address}</p>}
                </div>
              ))}
              <p className="border-t border-line pt-3 text-xs text-muted">
                Main contact: {app.contactEmail} · {app.contactPhone}
              </p>
              {app.lead && (
                <Link href={`/admin/leads/${app.lead.id}`} className="block text-xs underline">
                  Original enquiry ({sourceLabel(app.lead.source)})
                </Link>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Child</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1 text-sm">
              <p>Born {formatDate(app.dob, "d MMMM yyyy")}</p>
              <p>Current school: {app.currentSchool ?? "—"}</p>
              {app.student && (
                <p>
                  Student record:{" "}
                  <Link href={`/admin/students/${app.student.id}`} className="underline">
                    {app.student.admissionNo}
                  </Link>{" "}
                  ({app.student.status.toLowerCase()})
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {app.payments.map((p) => (
                <p key={p.id} className="flex justify-between">
                  <span>Registration · {p.receipt?.number}</span>
                  <span className="tabular-nums">{formatINR(p.amountPaise)}</span>
                </p>
              ))}
              {invoice && (
                <div className="border-t border-line pt-2">
                  <p className="flex justify-between font-medium">
                    <span>Invoice {invoice.number}</span>
                    <span className="tabular-nums">{formatINR(invoice.totalPaise)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Paid {formatINR(invoice.paidPaise)} · {invoice.status.toLowerCase()}
                  </p>
                </div>
              )}
              {!app.payments.length && !invoice && <p className="text-muted">None yet.</p>}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
