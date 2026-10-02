import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, FileJson, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { deletionPreview, getDataRequest, type DeletionPreview } from "@/lib/services/privacy";
import { DELETION_NOTE, RETENTION_YEARS } from "@/lib/services/privacy-rules";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { KindLabel, StatusBadge } from "../badges";
import { ResolveForm } from "./resolve-form";

export const metadata = { title: "Privacy request" };

function Checklist({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: DeletionPreview["erase"];
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </h3>
      <ul className="divide-y divide-line rounded-md border border-line">
        {items.map((i) => (
          <li key={i.key} data-policy={i.key} className="px-3 py-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{i.label}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {i.count > 0 ? `${i.count} held` : empty}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PrivacyRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("privacy:manage");
  const { id } = await params;
  const request = await getDataRequest(user, id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const preview = request.kind === "DELETION" ? await deletionPreview(user, id) : null;

  return (
    <>
      <Link
        href="/admin/settings/privacy"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden /> All privacy requests
      </Link>
      <PageHeader
        title={request.kind === "DELETION" ? "Deletion request" : "Data export request"}
        description={request.subjectEmail}
        actions={<StatusBadge status={request.status} />}
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Kind</dt>
              <dd>
                <KindLabel kind={request.kind} />
              </dd>
              <dt className="text-muted">Requested</dt>
              <dd>{formatDateTime(request.createdAt)} IST</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={request.status} />
              </dd>
              {request.handledBy && (
                <>
                  <dt className="text-muted">Handled by</dt>
                  <dd>{request.handledBy}</dd>
                </>
              )}
              <dt className="text-muted">Notes</dt>
              <dd className="break-words whitespace-pre-line">{request.notes ?? "None"}</dd>
            </dl>
          </CardBody>
        </Card>

        {request.status === "OPEN" ? (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Record the outcome</CardTitle>
            </CardHeader>
            <CardBody>
              <ResolveForm id={request.id} />
            </CardBody>
          </Card>
        ) : (
          <Card className="min-w-0">
            <CardBody className="text-sm text-muted">This request is closed.</CardBody>
          </Card>
        )}

        {request.kind === "EXPORT" && (
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>Data bundle</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <p>
                Compiles what the school holds about this email address: the guardian record, linked children
                (basic details), enquiries and applications, a fees summary, consent settings, portal requests
                and messages sent. Medical records, internal staff notes and credentials are left out.
              </p>
              <p className="text-muted">Each time a bundle is prepared, it is written to the audit log.</p>
              <a
                href={`/api/admin/privacy/${request.id}/bundle`}
                download
                className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-soft hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <FileJson className="size-4" aria-hidden /> Prepare data bundle
              </a>
            </CardBody>
          </Card>
        )}

        {preview && (
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>What a deletion would do</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm">
                Nothing is erased automatically. Use this checklist to carry out the erasure by hand, then
                mark the request done.
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <Checklist
                  title="Would be erased"
                  icon={<Trash2 className="size-4" aria-hidden />}
                  items={preview.erase}
                  empty="nothing held"
                />
                <Checklist
                  title={`Retained for legal reasons (fee records ${RETENTION_YEARS} years)`}
                  icon={<Archive className="size-4" aria-hidden />}
                  items={preview.retain}
                  empty="nothing held"
                />
              </div>
              <p className="text-xs text-muted">{DELETION_NOTE}</p>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
