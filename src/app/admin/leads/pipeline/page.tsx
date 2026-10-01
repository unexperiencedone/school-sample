import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { LEAD_STATUS_FLOW, LEAD_STATUS_LABEL } from "@/lib/services/leads";
import { PageHeader } from "@/components/crm/page-header";
import { LeadBoard } from "./board";

export const metadata = { title: "Lead pipeline" };
const PER_COLUMN = 30;

export default async function PipelinePage() {
  const user = await requireStaff("leads:read");
  const [counts, perStatus] = await Promise.all([
    db.lead.groupBy({ by: ["status"], where: { mergedIntoId: null }, _count: true }),
    Promise.all(
      LEAD_STATUS_FLOW.map((s) =>
        db.lead.findMany({
          where: { status: s, mergedIntoId: null },
          orderBy: { updatedAt: "desc" },
          take: PER_COLUMN,
        }),
      ),
    ),
  ]);
  const cards = perStatus
    .flat()
    .map((l) => ({
      id: l.id,
      parentName: l.parentName,
      childName: l.childName,
      classApplying: l.classApplying,
      source: l.source,
      status: l.status,
      age: formatDistanceToNowStrict(l.createdAt, { addSuffix: true }),
    }));
  const columns = LEAD_STATUS_FLOW.map((s) => ({
    value: s,
    label: LEAD_STATUS_LABEL[s],
    count: counts.find((c) => c.status === s)?._count ?? 0,
  }));
  return (
    <>
      <PageHeader
        title="Lead pipeline"
        description="Drag cards between stages, or use each card's menu. Showing the most recent 30 per stage."
        actions={
          <Link
            href="/admin/leads"
            className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-sunken"
          >
            Inbox view
          </Link>
        }
      />
      <LeadBoard columns={columns} cards={cards} canWrite={can(user.role, "leads:write")} />
    </>
  );
}
