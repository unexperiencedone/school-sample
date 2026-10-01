import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CLOSED, PIPELINE, STAGE_LABEL } from "@/lib/services/admissions";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";

export const metadata = { title: "Admissions" };

/** Applications by stage. Click through to act; stage changes happen on the application (with checks). */
export default async function ApplicationsBoard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; class?: string }>;
}) {
  await requireStaff("applications:read");
  const sp = await searchParams;
  const [years, classes] = await Promise.all([
    db.academicYear.findMany({ orderBy: { startDate: "asc" } }),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
  ]);
  const where = {
    stage: { not: "DRAFT" as const },
    ...(sp.year ? { startYearId: sp.year } : {}),
    ...(sp.class ? { classId: sp.class } : {}),
  };
  const apps = await db.application.findMany({
    where,
    include: { class: true, events: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Admissions pipeline"
        description={`${apps.length} applications. Days show time in the current stage.`}
        actions={
          <Link
            href="/admin/applications/list"
            className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-sunken"
          >
            Table view
          </Link>
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "select",
            name: "year",
            label: "Start session",
            options: years.map((y) => ({ value: y.id, label: y.name })),
          },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
      />
      <div className="relative flex gap-3 overflow-x-auto pb-4">
        {[...PIPELINE, ...CLOSED].map((stage) => {
          const list = apps.filter((a) => a.stage === stage);
          return (
            <section
              key={stage}
              aria-label={`${STAGE_LABEL[stage]} (${list.length})`}
              className={`flex w-60 shrink-0 flex-col rounded-lg p-2 ${CLOSED.includes(stage) ? "bg-sunken/50" : "bg-sunken"}`}
            >
              <h2 className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                {STAGE_LABEL[stage]}{" "}
                <span className="rounded-full bg-elevated px-2 py-0.5 text-fg">{list.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {list.slice(0, 40).map((a) => {
                  const since = a.events[0]?.createdAt ?? a.updatedAt;
                  const days = differenceInCalendarDays(now, since);
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/admin/applications/${a.id}`}
                        className="block rounded-md border border-line bg-elevated p-3 text-sm shadow-soft hover:border-line-strong"
                      >
                        <span className="font-medium">
                          {a.childFirstName} {a.childLastName}
                        </span>
                        <span className="block text-xs text-muted">
                          {a.class.name} · {a.boardingType.toLowerCase()} · {a.ref}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${days > 10 && !CLOSED.includes(stage) && stage !== "ADMITTED" ? "font-medium text-danger" : "text-muted"}`}
                        >
                          {days === 0 ? "today" : `${days} day${days > 1 ? "s" : ""}`}
                          {a.waitlistPosition ? ` · #${a.waitlistPosition} on list` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
