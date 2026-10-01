import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { RetryButton } from "./retry-button";

export const metadata = { title: "Message" };

export default async function OutboxItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("comms:read");
  const { id } = await params;
  const o = await db.outbox.findUnique({ where: { id } });
  if (!o) notFound();
  return (
    <>
      <PageHeader
        eyebrow={`${o.channel} · ${o.provider} · ${formatDate(o.createdAt, "d MMM yyyy, h:mm a")}`}
        title={o.subject ?? o.template}
        description={`To ${o.to}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={o.status === "SENT" ? "success" : o.status === "FAILED" ? "danger" : "neutral"}>
              {o.status.toLowerCase()}
            </Badge>
            {o.status === "FAILED" && can(user.role, "comms:send") && <RetryButton id={o.id} />}
            <Link href="/admin/outbox" className="text-sm underline">
              Back to outbox
            </Link>
          </div>
        }
      />
      {o.lastError && (
        <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          Last error: {o.lastError}
        </p>
      )}
      <Card>
        <CardBody className="p-0">
          {o.channel === "EMAIL" ? (
            <iframe
              title={`Email: ${o.subject}`}
              srcDoc={o.body}
              sandbox=""
              className="h-[70vh] w-full rounded-lg bg-white"
            />
          ) : (
            <pre className="overflow-auto p-5 text-sm whitespace-pre-wrap">
              {o.channel === "WEBHOOK" ? JSON.stringify(JSON.parse(o.body), null, 2) : o.body}
            </pre>
          )}
        </CardBody>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Attempts: {o.attempts} · Sent: {o.sentAt ? formatDate(o.sentAt, "d MMM, h:mm:ss a") : "—"} · Related:{" "}
        {o.relatedType ?? "—"} {o.relatedId ?? ""}
      </p>
    </>
  );
}
