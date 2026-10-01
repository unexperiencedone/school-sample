import Link from "next/link";
import { CalendarDays, Download } from "lucide-react";
import type { ApplicationStage } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/services/admissions";
import { DOCUMENT_KINDS } from "@/lib/schemas/registration";
import { DocumentUpload } from "@/components/forms/document-upload";
import { PayButton } from "@/components/forms/pay-button";
import { StageBadge } from "@/components/crm/badges";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { outstanding } from "@/lib/fee-engine";
import { toInstalmentState } from "@/lib/services/ledger";
import { cn } from "@/lib/utils";

const TRACK: { stages: ApplicationStage[]; label: string }[] = [
  { stages: ["REGISTERED"], label: "Registered" },
  { stages: ["DOCUMENTS"], label: "Documents" },
  { stages: ["ASSESSMENT"], label: "Assessment" },
  { stages: ["REVIEW", "WAITLISTED"], label: "Review" },
  { stages: ["OFFER"], label: "Offer" },
  { stages: ["FEE_PAID", "ADMITTED"], label: "Place confirmed" },
];

function trackIndex(stage: ApplicationStage) {
  return TRACK.findIndex((t) => t.stages.includes(stage));
}

/** Applicant dashboard: one card per application with a live tracker, documents, offer and payment. */
export default async function ApplicantHome() {
  const user = await requireRole(["APPLICANT", "PARENT"]);
  const apps = await db.application.findMany({
    where: { applicantUserId: user.id, stage: { not: "DRAFT" } },
    include: {
      class: true,
      startYear: true,
      documents: true,
      events: { orderBy: { createdAt: "desc" }, take: 6 },
      student: {
        include: {
          invoices: {
            where: { status: { not: "VOID" } },
            include: { instalments: { orderBy: { seq: "asc" } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-10">
      <div>
        <p className="t-eyebrow">Applicant dashboard</p>
        <h1 className="t-h1 mt-2 text-primary">Your application{apps.length > 1 ? "s" : ""}</h1>
      </div>
      {apps.length === 0 && (
        <p className="text-muted">
          No applications yet.{" "}
          <Link href="/admissions/register" className="underline">
            Start a registration
          </Link>
          .
        </p>
      )}
      {apps.map((a) => {
        const idx = trackIndex(a.stage);
        const closed = ["REJECTED", "WITHDRAWN"].includes(a.stage);
        const invoice = a.student?.invoices[0];
        const firstDue = invoice?.instalments.find((i) => outstanding(toInstalmentState(i)) > 0);
        return (
          <section
            key={a.id}
            aria-labelledby={`app-${a.id}`}
            className="rounded-xl border border-line bg-elevated p-6 shadow-soft sm:p-8"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id={`app-${a.id}`} className="font-serif text-3xl text-primary">
                  {a.childFirstName} {a.childLastName}
                </h2>
                <p className="text-sm text-muted">
                  {a.class.name} · {a.boardingType.toLowerCase()} boarding · {a.startYear.name} · Ref {a.ref}
                </p>
              </div>
              <StageBadge stage={a.stage} />
            </div>

            {!closed && (
              <ol className="mt-8 grid grid-cols-3 gap-y-6 sm:grid-cols-6" aria-label="Application progress">
                {TRACK.map((t, i) => {
                  const done = i < idx || (i === idx && ["ADMITTED", "FEE_PAID"].includes(a.stage));
                  const current = i === idx && !done;
                  return (
                    <li
                      key={t.label}
                      className="relative text-center"
                      aria-current={current ? "step" : undefined}
                    >
                      {i > 0 && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-4 right-1/2 left-[-50%] h-0.5",
                            i <= idx ? "bg-marigold-500" : "bg-sand",
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 mx-auto grid size-8 place-items-center rounded-full border-2 text-sm font-semibold",
                          done
                            ? "border-marigold-500 bg-marigold-500 text-damson-950"
                            : current
                              ? "border-damson-800 bg-paper text-damson-800"
                              : "border-sand bg-paper text-muted",
                        )}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span
                        className={cn("mt-2 block text-xs", current ? "font-semibold text-fg" : "text-muted")}
                      >
                        {t.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {a.stage === "WAITLISTED" && (
              <p className="mt-6 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning">
                Your daughter is #{a.waitlistPosition} on the waiting list for {a.class.name}. We&apos;ll
                contact you as soon as a place opens.
              </p>
            )}
            {closed && (
              <p className="mt-6 rounded-md bg-sunken px-4 py-3 text-sm">
                {a.decisionMessage ?? `This application is ${STAGE_LABEL[a.stage].toLowerCase()}.`}
              </p>
            )}

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="font-serif text-xl text-primary">Next steps</h3>
                <div className="mt-3 space-y-3 text-sm">
                  {a.assessmentAt && (
                    <p className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-kiln-700" aria-hidden /> Assessment:{" "}
                      {formatDate(a.assessmentAt, "EEEE d MMMM, h:mm a")} at the North Arch.
                    </p>
                  )}
                  {a.stage === "OFFER" && invoice && firstDue && (
                    <div className="rounded-lg bg-damson-900 p-5 text-paper">
                      <p className="font-serif text-2xl">We&apos;d love to welcome {a.childFirstName}.</p>
                      <p className="mt-1 text-sm text-damson-100">
                        Accept the offer by paying the first instalment of{" "}
                        {formatINR(outstanding(toInstalmentState(firstDue)))}
                        {a.offerExpiresAt ? ` by ${formatDate(a.offerExpiresAt, "d MMMM")}` : ""}.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <PayButton variant="accent" instalmentId={firstDue.id} label="Accept and pay" />
                        <a
                          href={`/api/applicant/applications/${a.id}/offer-letter`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 text-sm underline"
                        >
                          <Download className="size-4" aria-hidden /> Offer letter (PDF)
                        </a>
                      </div>
                    </div>
                  )}
                  {(a.stage === "FEE_PAID" || a.stage === "ADMITTED") && (
                    <p className="rounded-md bg-success-bg px-4 py-3 text-success">
                      Place confirmed.{" "}
                      {a.stage === "ADMITTED"
                        ? "Parent portal access is ready."
                        : "The admissions team will complete enrolment shortly."}
                    </p>
                  )}
                  {a.offerIssuedAt && a.stage !== "OFFER" && (
                    <a
                      href={`/api/applicant/applications/${a.id}/offer-letter`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 underline"
                    >
                      <Download className="size-4" aria-hidden /> Offer letter (PDF)
                    </a>
                  )}
                  <h4 className="pt-2 font-medium">Recent updates</h4>
                  <ul className="space-y-1.5 text-muted">
                    {a.events.map((e) => (
                      <li key={e.id}>
                        {formatDate(e.createdAt, "d MMM")} — {STAGE_LABEL[e.toStage]}
                        {e.note && !e.note.toLowerCase().includes("internal") ? `: ${e.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {!closed && a.stage !== "ADMITTED" && (
                <div>
                  <h3 className="font-serif text-xl text-primary">Documents</h3>
                  <div className="mt-3 grid gap-3">
                    {DOCUMENT_KINDS.map((k) => {
                      const d = a.documents.find((x) => x.kind === k.kind);
                      if (d?.status === "VERIFIED")
                        return (
                          <p
                            key={k.kind}
                            className="flex items-center justify-between rounded-lg border border-success/40 bg-success-bg/40 px-4 py-3 text-sm"
                          >
                            {k.label} <span className="text-success">Verified</span>
                          </p>
                        );
                      return (
                        <div key={k.kind}>
                          {d?.status === "REJECTED" && (
                            <p className="mb-1 text-xs text-danger">Please re-upload: {d.note}</p>
                          )}
                          <DocumentUpload
                            applicationId={a.id}
                            kind={k.kind}
                            label={k.label}
                            hint={k.hint}
                            initial={{ fileName: d?.status === "REJECTED" ? null : d?.fileName }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
