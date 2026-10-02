import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { BAND_LABEL } from "@/lib/services/fee-data";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { updateSectionAction } from "./actions";

export const metadata = { title: "Classes & sections" };

/** Every class and section for a year: who teaches it, where, and how full it is. */
export default async function AcademicsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireStaff("academics:read");
  const sp = await searchParams;
  const years = await db.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const year = years.find((y) => y.name === sp.year) ?? years.find((y) => y.isCurrent)!;
  const [classes, staff] = await Promise.all([
    db.classLevel.findMany({
      orderBy: { order: "asc" },
      include: {
        sections: {
          where: { yearId: year.id },
          orderBy: { name: "asc" },
          include: {
            classTeacher: true,
            _count: { select: { students: { where: { status: { in: ["ACTIVE", "PROSPECTIVE"] } } } } },
          },
        },
      },
    }),
    db.staff.findMany({ where: { active: true }, orderBy: { firstName: "asc" } }),
  ]);
  const canWrite = can(user.role, "academics:write");
  const totals = classes
    .flatMap((c) => c.sections)
    .reduce((a, s) => ({ cap: a.cap + s.capacity, n: a.n + s._count.students }), { cap: 0, n: 0 });
  return (
    <>
      <PageHeader
        title="Classes & sections"
        description={`${year.name}: ${totals.n} pupils in ${totals.cap} places across ${classes.flatMap((c) => c.sections).length} sections.`}
      />
      <nav aria-label="Academic year" className="mb-4 flex gap-1">
        {years.map((y) => (
          <Link
            key={y.id}
            href={`/admin/academics?year=${y.name}`}
            aria-current={y.id === year.id ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              y.id === year.id ? "bg-primary text-primary-fg" : "text-muted hover:bg-sunken hover:text-fg",
            )}
          >
            {y.name}
          </Link>
        ))}
      </nav>
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <Table>
          <THead>
            <tr>
              <Th>Class</Th>
              <Th>Section</Th>
              <Th>Form tutor</Th>
              <Th>Room</Th>
              <Th className="text-right">Pupils</Th>
              <Th className="w-48">Fill</Th>
              {canWrite && <Th />}
            </tr>
          </THead>
          <tbody>
            {classes.flatMap((c) =>
              c.sections.map((s, k) => {
                const pct = Math.round((s._count.students / s.capacity) * 100);
                return (
                  <Tr key={s.id}>
                    <Td>
                      {k === 0 && (
                        <>
                          <span className="font-medium">{c.name}</span>
                          <span className="block text-xs text-muted">{BAND_LABEL[c.band]}</span>
                        </>
                      )}
                    </Td>
                    <Td>
                      <Link href={`/admin/students?class=${c.id}`} className="hover:underline">
                        {c.name} {s.name}
                      </Link>
                    </Td>
                    <Td>
                      {s.classTeacher ? (
                        `${s.classTeacher.firstName} ${s.classTeacher.lastName}`
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-muted">{s.room ?? "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {s._count.students} / {s.capacity}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 flex-1 overflow-hidden rounded-[4px]"
                          style={{ background: "var(--viz-track)" }}
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-r-[4px]"
                            style={{ width: `${Math.min(100, pct)}%`, background: "var(--viz-1)" }}
                          />
                        </span>
                        <span
                          className={cn(
                            "w-12 text-right text-xs tabular-nums",
                            pct >= 100 ? "font-semibold text-fg" : "text-muted",
                          )}
                        >
                          {pct >= 100 ? "Full" : `${pct}%`}
                        </span>
                      </span>
                    </Td>
                    {canWrite && (
                      <Td>
                        <details className="relative">
                          <summary className="cursor-pointer list-none text-sm text-primary underline">
                            Edit
                          </summary>
                          <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-line bg-elevated p-4 shadow-lift">
                            <ActionForm
                              action={updateSectionAction.bind(null, s.id)}
                              className="space-y-3 text-sm"
                            >
                              <label className="block">
                                <span className="mb-1 block text-xs text-muted">Form tutor</span>
                                <Select name="classTeacherId" defaultValue={s.classTeacherId ?? ""}>
                                  <option value="">—</option>
                                  {staff.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.firstName} {t.lastName}
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <label>
                                  <span className="mb-1 block text-xs text-muted">Capacity</span>
                                  <Input
                                    name="capacity"
                                    defaultValue={String(s.capacity)}
                                    inputMode="numeric"
                                    required
                                  />
                                </label>
                                <label>
                                  <span className="mb-1 block text-xs text-muted">Room</span>
                                  <Input name="room" defaultValue={s.room ?? ""} />
                                </label>
                              </div>
                              <Button type="submit" size="sm">
                                Save
                              </Button>
                            </ActionForm>
                          </div>
                        </details>
                      </Td>
                    )}
                  </Tr>
                );
              }),
            )}
          </tbody>
        </Table>
      </div>
    </>
  );
}
