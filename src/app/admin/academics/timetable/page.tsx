import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PERIOD_TIMES, WEEKDAYS } from "@/config/timetable";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { cn } from "@/lib/utils";

export const metadata = { title: "Timetable" };

/** The weekly grid for a form or a teacher. Lessons with no teacher are shown as needing cover. */
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; teacher?: string }>;
}) {
  const user = await requireStaff("academics:read");
  const sp = await searchParams;
  const year = await db.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const [sections, teachers, me] = await Promise.all([
    db.section.findMany({
      where: { yearId: year.id, timetable: { some: {} } },
      include: { class: true },
      orderBy: [{ class: { order: "asc" } }, { name: "asc" }],
    }),
    db.staff.findMany({ where: { active: true, timetable: { some: {} } }, orderBy: { firstName: "asc" } }),
    db.staff.findUnique({ where: { userId: user.id }, select: { id: true } }),
  ]);
  const teacherId = sp.teacher ?? (!sp.section && me ? me.id : undefined);
  const section = !teacherId ? (sections.find((s) => s.id === sp.section) ?? sections[0]) : undefined;
  const slots = await db.timetableSlot.findMany({
    where: teacherId ? { teacherId, section: { yearId: year.id } } : { sectionId: section?.id ?? "" },
    include: { subject: true, teacher: true, section: { include: { class: true } } },
  });
  const teacher = teachers.find((t) => t.id === teacherId);
  const at = (day: number, period: number) => slots.find((s) => s.day === day && s.period === period);
  const cover = slots.filter((s) => !s.teacherId).length;
  return (
    <>
      <PageHeader
        title={
          teacher
            ? `${teacher.firstName} ${teacher.lastName}`
            : `${section?.class.name ?? ""} ${section?.name ?? ""} timetable`
        }
        description={
          teacher
            ? `${slots.length} lessons a week · ${year.name}`
            : `${year.name}${cover ? ` · ${cover} lesson${cover === 1 ? "" : "s"} needing cover` : " · fully staffed"}`
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "select",
            name: "section",
            label: "Form",
            options: sections.map((s) => ({ value: s.id, label: `${s.class.name} ${s.name}` })),
          },
          {
            type: "select",
            name: "teacher",
            label: "Teacher",
            options: teachers.map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
          },
        ]}
      />
      <div className="overflow-x-auto rounded-lg border border-line bg-elevated">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Weekly timetable, days by periods</caption>
          <thead>
            <tr className="bg-sunken text-left text-xs font-semibold tracking-wide text-muted uppercase">
              <th scope="col" className="w-28 border-b border-line px-3 py-2.5">
                Period
              </th>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="border-b border-line px-3 py-2.5">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((p) => (
              <tr key={p}>
                <th scope="row" className="border-b border-line px-3 py-2 text-left align-top font-normal">
                  <span className="font-medium">P{p}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {PERIOD_TIMES[p]?.start}–{PERIOD_TIMES[p]?.end}
                  </span>
                </th>
                {WEEKDAYS.map((_, i) => {
                  const s = at(i + 1, p);
                  return (
                    <td
                      key={i}
                      className={cn(
                        "border-b border-l border-line px-3 py-2 align-top",
                        s && !s.teacherId && "bg-danger-bg",
                      )}
                    >
                      {s ? (
                        <>
                          <span className="block font-medium">{s.subject.name}</span>
                          <span
                            className={cn(
                              "block text-xs",
                              s.teacherId ? "text-muted" : "font-medium text-danger",
                            )}
                          >
                            {teacher
                              ? `${s.section.class.name} ${s.section.name}`
                              : s.teacher
                                ? `${s.teacher.firstName} ${s.teacher.lastName}`
                                : "Cover needed"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">{teacher ? "Free" : "—"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
