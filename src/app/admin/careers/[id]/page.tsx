import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarX2, Download, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getApplication } from "@/lib/services/careers-admin";
import {
  applicationGaps,
  displayName,
  monthLabel,
  safeguardingFlags,
  SCORE_CRITERIA,
  SCORE_MAX,
  staffFromApplication,
} from "@/lib/services/careers-admin-rules";
import { STEPS } from "@/lib/schemas/staff-application";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationStatusBadge, ScoreText } from "../badges";
import { AddToStaffForm, NoteForm, PrintButton, ScorecardForm, StageForm } from "./controls";

export const metadata = { title: "Staff application" };

/** Hides the CRM shell and forces light colours when printing, whatever theme the screen is in. */
const PRINT_CSS = `@media print {
  #crm-root aside, #crm-root header, [data-sonner-toaster] { display: none !important; }
  #crm-root, #crm-root[data-theme] {
    --bg: #fff; --bg-elevated: #fff; --bg-sunken: #f4ece0; --fg: #231a21; --fg-muted: #4d3f49;
    --line: #cfc3b5; --line-strong: #8f847c; --primary: #3d1d38;
    --success: #2f6b47; --success-bg: #dcefe2; --warning: #8a5a00; --warning-bg: #fbecc8;
    --danger: #a3302a; --danger-bg: #f8dcd9; --info: #2d5a86; --info-bg: #dde9f5;
  }
  #main { padding: 0 !important; }
}`;

const day = (v: string) => formatDate(`${v}T00:00:00Z`);

function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="break-words">{v || "Not given"}</dd>
        </div>
      ))}
    </dl>
  );
}

function StepCard({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const id = `step-${n}`;
  return (
    <section aria-labelledby={id}>
      <Card className="print:rounded-none print:border-x-0 print:border-t-0">
        <CardHeader className="print:px-0">
          <CardTitle id={id}>
            {n}. {title}
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 print:px-0">{children}</CardBody>
      </Card>
    </section>
  );
}

const Sub = ({ children }: { children: ReactNode }) => (
  <div className="break-inside-avoid rounded-md border border-line p-3 text-sm">{children}</div>
);

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("careers:read");
  const { id } = await params;
  const app = await getApplication(user, id);
  if (!app) notFound();
  const canWrite = can(user.role, "careers:write");
  const { data } = app;
  const name = displayName({ fullName: app.fullName, email: app.email, data });
  const flags = safeguardingFlags(data);
  const gaps = applicationGaps(data, formatDate(new Date(), "yyyy-MM"));
  const p = data.personal;
  const f = data.family;
  const dec = data.declaration;
  const emailLink = (
    <a href={`mailto:${app.email}`} className="underline">
      {app.email}
    </a>
  );
  const hiredAndMissing = app.status === "HIRED" && !app.staff;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow={`Application ${app.ref}`}
        title={name}
        description={
          <>
            {app.vacancy ? (
              <>
                Applying for{" "}
                <Link href="/admin/careers/vacancies" className="underline print:no-underline">
                  {app.vacancy.title}
                </Link>
              </>
            ) : (
              "General application"
            )}
            {app.submittedAt && <> · Submitted {formatDate(app.submittedAt, "d MMM yyyy, h:mm a")}</>}
          </>
        }
        actions={
          <>
            <ApplicationStatusBadge status={app.status} />
            <span className="flex gap-2 print:hidden">
              <PrintButton />
              <a
                href={`/api/admin/staff-applications/${app.id}/pdf`}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-transparent px-4 text-sm font-medium hover:bg-sunken"
              >
                <Download className="size-4" aria-hidden /> Download PDF
              </a>
            </span>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] print:block">
        <div className="min-w-0 space-y-5">
          {flags.length > 0 && (
            <section
              aria-labelledby="flags-title"
              className="rounded-lg border-2 border-danger bg-danger-bg p-4 text-fg"
            >
              <h2
                id="flags-title"
                className="flex items-center gap-2 font-sans text-base font-semibold text-danger"
              >
                <ShieldAlert className="size-5 shrink-0" aria-hidden />
                Safeguarding flag: declaration to review before progressing
              </h2>
              <ul className="mt-3 space-y-3 text-sm">
                {flags.map((fl) => (
                  <li key={fl.key}>
                    <p className="font-semibold">{fl.label}</p>
                    <p className="whitespace-pre-line">{fl.detail}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                A declaration is not a decision. Follow the safer recruitment policy and speak to the
                Designated Safeguarding Lead if unsure.
              </p>
            </section>
          )}

          {gaps.length > 0 && (
            <section
              aria-labelledby="gaps-title"
              className="rounded-lg border border-warning bg-warning-bg p-4 text-fg"
            >
              <h2
                id="gaps-title"
                className="flex items-center gap-2 font-sans text-base font-semibold text-warning"
              >
                <CalendarX2 className="size-5 shrink-0" aria-hidden />
                Employment gap{gaps.length === 1 ? "" : "s"} to explore at interview
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {gaps.map((g) => (
                  <li key={g.from}>
                    {g.months} months: {monthLabel(g.from)} to {monthLabel(g.to)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <StepCard n={1} title={STEPS[0].title}>
            <Dl
              items={[
                ["Name", p ? `${p.title} ${p.fullName}` : ""],
                ["Date of birth", p ? day(p.dob) : ""],
                ["Gender", p ? p.gender.toLowerCase() : ""],
                ["Nationality", p?.nationality],
                ["Email", emailLink],
                ["Phone", p?.phone],
                ["Address", p?.address],
                ["Availability or notice", p?.noticeOrAvailability],
              ]}
            />
          </StepCard>

          <StepCard n={2} title={STEPS[1].title}>
            <Dl
              items={[
                ["Marital status", f?.maritalStatus],
                [
                  "Children",
                  f?.children?.length
                    ? f.children.map((c) => `${c.name} (born ${day(c.dob)})`).join("; ")
                    : "None listed",
                ],
                ["Emergency contact", f ? `${f.emergencyName} (${f.emergencyRelation})` : ""],
                ["Emergency phone", f?.emergencyPhone],
              ]}
            />
          </StepCard>

          <StepCard n={3} title={STEPS[2].title}>
            {(data.education?.items ?? []).map((e) => (
              <Sub key={`${e.qualification}-${e.year}`}>
                <p className="font-medium">{e.qualification}</p>
                <p>
                  {e.institution}, {e.year}
                  {e.grade ? ` · ${e.grade}` : ""}
                </p>
                <p className="text-xs text-muted">
                  {e.certificateKey ? "Certificate uploaded" : "No certificate uploaded"}
                </p>
              </Sub>
            ))}
          </StepCard>

          <StepCard n={4} title={STEPS[3].title}>
            {data.current?.employed ? (
              <Dl
                items={[
                  ["Employer", data.current.employer],
                  ["Role", data.current.role],
                  ["Since", data.current.since ? monthLabel(data.current.since) : ""],
                  ["Notice period", data.current.noticePeriod],
                  ["Reason for leaving", data.current.reasonForLeaving],
                ]}
              />
            ) : (
              <p className="text-sm">Not currently employed.</p>
            )}
          </StepCard>

          <StepCard n={5} title={STEPS[4].title}>
            {(data.history?.items ?? []).length === 0 && (
              <p className="text-sm">No earlier employment listed.</p>
            )}
            {(data.history?.items ?? []).map((j) => (
              <Sub key={`${j.employer}-${j.from}`}>
                <p className="font-medium">
                  {j.role}, {j.employer}
                </p>
                <p>
                  {monthLabel(j.from)} to {monthLabel(j.to)}
                  {j.reasonForLeaving ? ` · Left: ${j.reasonForLeaving}` : ""}
                </p>
              </Sub>
            ))}
          </StepCard>

          <StepCard n={6} title={STEPS[5].title}>
            <Dl
              items={[
                ["Subjects and areas", data.interests?.subjects?.join(", ")],
                ["Phases", data.interests?.phases?.join(", ")],
                ["Interests", data.interests?.interests],
              ]}
            />
          </StepCard>

          <StepCard n={7} title={STEPS[6].title}>
            <div className="max-w-prose space-y-3 text-sm leading-relaxed">
              {(data.statement?.text ?? "Not given").split(/\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </StepCard>

          <StepCard n={8} title={STEPS[7].title}>
            {(data.references?.items ?? []).map((r) => (
              <Sub key={r.email}>
                <p className="font-medium">
                  {r.name}
                  {r.isCurrentEmployer && (
                    <span className="text-muted"> · current or most recent employer</span>
                  )}
                </p>
                <p>
                  {r.role}, {r.organisation}
                </p>
                <p className="break-words">
                  {r.email}
                  {r.phone ? ` · ${r.phone}` : ""}
                </p>
                <p className="text-xs text-muted">{r.relationship}</p>
              </Sub>
            ))}
          </StepCard>

          <StepCard n={9} title={STEPS[8].title}>
            <Dl
              items={[
                ["Safeguarding statement", dec?.safeguarding ? "Confirmed" : "Not confirmed"],
                [
                  "Convictions, cautions or reprimands",
                  dec?.convictions === "DECLARE"
                    ? `Declared: ${dec.convictionsDetail || "no details"}`
                    : "None declared",
                ],
                [
                  "Pending action",
                  dec?.pendingAction === "DECLARE"
                    ? `Declared: ${dec.pendingActionDetail || "no details"}`
                    : "None declared",
                ],
                ["Consent to process", dec?.consent ? "Given" : "Not given"],
                ["Information accurate", dec?.truthful ? "Confirmed" : "Not confirmed"],
              ]}
            />
          </StepCard>

          {app.scorecard && (
            <section aria-label="Scorecard" className="hidden break-inside-avoid text-sm print:block">
              <h2 className="font-sans text-base font-semibold">Scorecard</h2>
              <ul>
                {SCORE_CRITERIA.map((c) => (
                  <li key={c.key}>
                    {c.label}: {app.scorecard![c.key]} / 5
                  </li>
                ))}
              </ul>
              <p className="font-semibold">
                Total: {app.score} / {SCORE_MAX}
              </p>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-5 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Stage</CardTitle>
              <ApplicationStatusBadge status={app.status} />
            </CardHeader>
            <CardBody className="space-y-3">
              {canWrite ? (
                <StageForm key={app.status} id={app.id} status={app.status} />
              ) : (
                <p className="text-sm text-muted">You can view this application but not change its stage.</p>
              )}
              {app.staff && (
                <p className="text-sm">
                  In the staff directory:{" "}
                  <Link
                    href={`/admin/careers/staff?q=${encodeURIComponent(app.email)}`}
                    className="underline"
                  >
                    {app.staff.firstName} {app.staff.lastName}
                  </Link>
                </p>
              )}
            </CardBody>
          </Card>

          {hiredAndMissing && canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Add to staff directory</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="mb-3 text-sm text-muted">
                  Creates the staff record from this application. Check the details first.
                </p>
                <AddToStaffForm
                  id={app.id}
                  defaults={staffFromApplication(data, app.vacancy)}
                  today={formatDate(new Date(), "yyyy-MM-dd")}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Scorecard</CardTitle>
              <ScoreText score={app.score} />
            </CardHeader>
            <CardBody>
              {app.status === "DRAFT" ? (
                <p className="text-sm text-muted">A draft cannot be scored.</p>
              ) : canWrite ? (
                <>
                  <ScorecardForm id={app.id} card={app.scorecard} />
                  {app.scorecard && (
                    <p className="mt-3 text-xs text-muted">
                      Last scored by {app.scorecard.scoredByName ?? "a colleague"} on{" "}
                      {formatDate(app.scorecard.scoredAt, "d MMM yyyy")}.
                    </p>
                  )}
                </>
              ) : app.scorecard ? (
                <ul className="space-y-1 text-sm">
                  {SCORE_CRITERIA.map((c) => (
                    <li key={c.key} className="flex justify-between">
                      <span>{c.label}</span>
                      <span className="tabular-nums">{app.scorecard![c.key]} / 5</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Not scored yet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {canWrite && <NoteForm id={app.id} />}
              {app.notes.length === 0 ? (
                <p className="text-sm text-muted">No notes yet.</p>
              ) : (
                <ol className="space-y-3" aria-label="Notes, newest first">
                  {app.notes.map((n) => (
                    <li key={n.id} className="border-t border-line pt-3 text-sm first:border-0 first:pt-0">
                      <p className="break-words whitespace-pre-line">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {n.author?.name ?? "System"} · {formatDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
