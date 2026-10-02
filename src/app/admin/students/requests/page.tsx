import Link from "next/link";
import type { PortalRequestStatus } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { respondRequestAction } from "../actions";

export const metadata = { title: "Family requests" };

const KIND: Record<string, string> = {
  WITHDRAWAL: "Withdrawal notice",
  CONCESSION: "Concession request",
  PROFILE_UPDATE: "Profile update",
  IMPREST_TOPUP: "Pocket-money top-up",
};
const TABS: { key: string; label: string; statuses: PortalRequestStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["OPEN", "IN_REVIEW"] },
  { key: "closed", label: "Closed", statuses: ["APPROVED", "REJECTED", "CLOSED"] },
];

function Payload({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const p = payload as Record<string, string | number | undefined>;
  if (kind === "WITHDRAWAL")
    return (
      <p>
        Last day {p.lastDay ? formatDate(String(p.lastDay)) : "—"} · {p.reason ?? ""}
        {p.destination ? ` · going to ${p.destination}` : ""}
      </p>
    );
  if (kind === "PROFILE_UPDATE")
    return (
      <ul className="list-disc pl-4">
        {Object.entries(p)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <li key={k}>
              {k}: {String(v)}
            </li>
          ))}
      </ul>
    );
  if (kind === "IMPREST_TOPUP")
    return (
      <p>
        {p.amountPaise ? formatINR(Number(p.amountPaise)) : ""} · {p.note ?? ""}
      </p>
    );
  return <p>{String(p.reason ?? p.note ?? "")}</p>;
}

/** Withdrawal notices, concession requests and profile changes sent by parents from the portal. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff("students:read");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0]!;
  const requests = await db.portalRequest.findMany({
    where: { status: { in: tab.statuses } },
    include: { student: { include: { class: true } }, guardian: true },
    orderBy: { createdAt: tab.key === "open" ? "asc" : "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader
        title="Requests from families"
        description="Sent from the parent portal. Your reply is shown to the family there."
      />
      <nav aria-label="Request status" className="mb-4 flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/students/requests?tab=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              t.key === tab.key ? "bg-primary text-primary-fg" : "text-muted hover:bg-sunken hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {requests.length ? (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card
              key={r.id}
              data-request={r.id}
              className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_22rem]"
            >
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{KIND[r.kind]}</span>
                  <Badge
                    tone={
                      r.status === "OPEN"
                        ? "info"
                        : r.status === "IN_REVIEW"
                          ? "accent"
                          : r.status === "APPROVED"
                            ? "success"
                            : "neutral"
                    }
                  >
                    {r.status.toLowerCase().replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-muted">{formatDate(r.createdAt, "d MMM yyyy, h:mm a")}</span>
                </p>
                <p className="mt-1">
                  <Link href={`/admin/students/${r.studentId}`} className="underline">
                    {r.student.firstName} {r.student.lastName}
                  </Link>{" "}
                  <span className="text-muted">
                    · {r.student.class.name} · from {r.guardian.name}
                  </span>
                </p>
                <div className="mt-2 rounded-md bg-sunken p-3">
                  <Payload kind={r.kind} payload={r.payload as Record<string, unknown>} />
                </div>
                {r.response && <p className="mt-2 text-muted">Reply: {r.response}</p>}
              </div>
              <ActionForm action={respondRequestAction.bind(null, r.id)} className="space-y-2 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Status</span>
                  <Select name="status" defaultValue={r.status === "OPEN" ? "IN_REVIEW" : r.status}>
                    <option value="IN_REVIEW">In review</option>
                    <option value="APPROVED">Approved / done</option>
                    <option value="REJECTED">Declined</option>
                    <option value="CLOSED">Closed</option>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Reply to the family</span>
                  <Textarea name="response" rows={2} defaultValue={r.response ?? ""} />
                </label>
                <Button type="submit" size="sm">
                  Save reply
                </Button>
              </ActionForm>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No requests here" />
      )}
    </>
  );
}
