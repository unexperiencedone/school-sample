import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { selectChild } from "@/lib/services/portal";
import { ChildHeader, NoChildren } from "@/components/portal/child-card";
import { RequestForm } from "@/components/portal/request-form";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Requests" };

const KIND: Record<string, string> = {
  WITHDRAWAL: "Withdrawal notice",
  CONCESSION: "Scholarship or bursary",
  PROFILE_UPDATE: "Contact details",
  IMPREST_TOPUP: "Pocket money",
};
const STATUS: Record<string, string> = {
  OPEN: "sent",
  IN_REVIEW: "in review",
  APPROVED: "done",
  REJECTED: "declined",
  CLOSED: "closed",
};

export default async function Requests({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireRole(["PARENT"]);
  const { child } = await selectChild(user, (await searchParams).child);
  if (!child) return <NoChildren />;
  const requests = await db.portalRequest.findMany({
    where: { studentId: child.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <ChildHeader child={child} title="Requests" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="new-h" className="rounded-xl border border-line bg-elevated p-6">
          <h2 id="new-h" className="mb-4 font-serif text-xl">
            New request
          </h2>
          <RequestForm studentId={child.id} childName={child.firstName} />
        </section>
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="mb-4 font-serif text-xl">
            Your requests
          </h2>
          {requests.length ? (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-elevated p-4 text-sm">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{KIND[r.kind]}</span>
                    <Badge
                      tone={
                        r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "neutral" : "info"
                      }
                    >
                      {STATUS[r.status]}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted">Sent {formatDate(r.createdAt, "d MMM yyyy")}</p>
                  {r.response && <p className="mt-2 rounded-md bg-sunken p-3">School: {r.response}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nothing sent yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
