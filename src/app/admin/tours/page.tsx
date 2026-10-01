import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { upcomingSlots } from "@/lib/services/tours";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { BookingButtons, SlotCreator } from "./tour-controls";

export const metadata = { title: "Tours & events" };

export default async function ToursPage() {
  const user = await requireStaff("tours:read");
  const slots = await upcomingSlots(28);
  const byDay = new Map<string, typeof slots>();
  for (const s of slots)
    byDay.set(formatDate(s.startsAt, "yyyy-MM-dd"), [
      ...(byDay.get(formatDate(s.startsAt, "yyyy-MM-dd")) ?? []),
      s,
    ]);
  const canWrite = can(user.role, "tours:write");
  return (
    <>
      <PageHeader
        title="Tours & events"
        description="Campus tour slots for the next four weeks, with bookings and check-in. Families get a confirmation on booking and a reminder the day before."
        actions={
          <Link
            href="/admin/content/events"
            className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-sunken"
          >
            Open Mornings & events
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {byDay.size === 0 && (
            <EmptyState title="No upcoming slots">Create some slots so families can book online.</EmptyState>
          )}
          {[...byDay].map(([day, list]) => (
            <Card key={day}>
              <CardHeader>
                <CardTitle>{formatDate(list[0]!.startsAt, "EEEE d MMMM")}</CardTitle>
                <span className="text-xs text-muted">
                  {list.reduce((a, s) => a + s.bookings.filter((b) => b.status !== "CANCELLED").length, 0)}{" "}
                  bookings
                </span>
              </CardHeader>
              <CardBody className="space-y-4">
                {list.map((s) => {
                  const active = s.bookings.filter((b) => b.status !== "CANCELLED");
                  const full = active.length >= s.capacity;
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between text-sm">
                        <p className="font-medium">
                          {formatDate(s.startsAt, "h:mm a")} · {s.label}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            full ? "bg-danger-bg text-danger" : "bg-sunken text-muted",
                          )}
                        >
                          {active.length}/{s.capacity} families
                        </span>
                      </div>
                      {s.bookings.length > 0 && (
                        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                          {s.bookings.map((b) => (
                            <li
                              key={b.id}
                              className={cn(
                                "flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm",
                                b.status === "CANCELLED" && "opacity-50",
                              )}
                            >
                              <span>
                                <Link
                                  href={`/admin/leads/${b.leadId}`}
                                  className="font-medium hover:underline"
                                >
                                  {b.lead.parentName}
                                </Link>
                                <span className="text-xs text-muted">
                                  {" "}
                                  · {b.lead.classApplying} · {b.visitors} visitor{b.visitors > 1 ? "s" : ""} ·{" "}
                                  {b.lead.phone}
                                </span>
                              </span>
                              {canWrite ? (
                                <BookingButtons id={b.id} status={b.status} />
                              ) : (
                                <span className="text-xs text-muted">{b.status}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ))}
        </div>
        {canWrite && (
          <aside>
            <Card>
              <CardHeader>
                <CardTitle>Add tour slots</CardTitle>
              </CardHeader>
              <CardBody>
                <SlotCreator />
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
