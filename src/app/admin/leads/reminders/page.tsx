import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/crm/page-header";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/dates";
import { DoneButton } from "../[id]/lead-controls";

export const metadata = { title: "Reminders" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const user = await requireStaff("leads:read");
  const { who } = await searchParams;
  const reminders = await db.reminder.findMany({
    where: { doneAt: null, ...(who === "all" ? {} : { assignedToId: user.id }) },
    include: {
      lead: { select: { id: true, parentName: true, classApplying: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Reminders"
        description="Follow-ups due, oldest first."
        actions={
          <div className="flex gap-1 rounded-md bg-sunken p-1 text-sm">
            <Link
              href="/admin/leads/reminders"
              className={`rounded px-3 py-1 ${who !== "all" ? "bg-elevated shadow-soft" : ""}`}
            >
              Mine
            </Link>
            <Link
              href="/admin/leads/reminders?who=all"
              className={`rounded px-3 py-1 ${who === "all" ? "bg-elevated shadow-soft" : ""}`}
            >
              Team
            </Link>
          </div>
        }
      />
      {reminders.length === 0 ? (
        <EmptyState title="Nothing due">You&apos;re all caught up.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-elevated">
          <Table>
            <THead>
              <tr>
                <Th>Due</Th>
                <Th>Reminder</Th>
                <Th>Lead</Th>
                <Th>Owner</Th>
                <Th />
              </tr>
            </THead>
            <tbody>
              {reminders.map((r) => (
                <Tr key={r.id}>
                  <Td className={r.dueAt < now ? "font-medium text-danger" : ""}>
                    {formatDate(r.dueAt, "EEE d MMM")}
                  </Td>
                  <Td>{r.title}</Td>
                  <Td>
                    {r.lead ? (
                      <Link href={`/admin/leads/${r.lead.id}`} className="underline">
                        {r.lead.parentName} · {r.lead.classApplying}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-muted">{r.assignedTo?.name ?? "—"}</Td>
                  <Td className="text-right">
                    <DoneButton reminderId={r.id} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
