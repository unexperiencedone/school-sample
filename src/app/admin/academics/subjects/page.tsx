import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/crm/page-header";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  await requireStaff("academics:read");
  const year = await db.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      teachers: {
        where: { active: true },
        select: { firstName: true, lastName: true },
        orderBy: { firstName: "asc" },
      },
      _count: { select: { timetable: { where: { section: { yearId: year.id } } } } },
    },
  });
  const unstaffed = await db.timetableSlot.groupBy({
    by: ["subjectId"],
    where: { teacherId: null, section: { yearId: year.id } },
    _count: true,
  });
  return (
    <>
      <PageHeader
        title="Subjects"
        description={`Taught in ${year.name}, with the staff qualified to teach each one.`}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <Table>
          <THead>
            <tr>
              <Th>Code</Th>
              <Th>Subject</Th>
              <Th>Teachers</Th>
              <Th className="text-right">Lessons a week</Th>
              <Th className="text-right">Needing cover</Th>
            </tr>
          </THead>
          <tbody>
            {subjects.map((s) => {
              const cover = unstaffed.find((u) => u.subjectId === s.id)?._count ?? 0;
              return (
                <Tr key={s.id}>
                  <Td className="font-mono text-xs">{s.code}</Td>
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="text-sm">
                    {s.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ") || (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{s._count.timetable || "—"}</Td>
                  <Td
                    className={`text-right tabular-nums ${cover ? "font-semibold text-danger" : "text-muted"}`}
                  >
                    {cover || "—"}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </>
  );
}
