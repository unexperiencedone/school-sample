import Link from "next/link";
import { Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { directoryInclude, directoryWhere } from "@/lib/services/students";
import { BOARDING_LABEL } from "@/lib/services/fee-data";
import { initials } from "@/lib/utils";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { TableKeys } from "@/components/crm/table/table-keys";
import { Badge } from "@/components/ui/badge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";

export const metadata = { title: "Students" };
type Row = Prisma.StudentGetPayload<{ include: typeof directoryInclude }>;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("students:read");
  const sp = await searchParams;
  const p = parseListParams(sp, {
    sorts: ["lastName", "firstName", "admissionNo", "class.order"],
    defaultSort: "class.order",
    defaultDir: "asc",
    take: 50,
  });
  const [year, classes, houses] = await Promise.all([
    db.academicYear.findFirstOrThrow({ where: { isCurrent: true } }),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.house.findMany({ orderBy: { name: "asc" } }),
  ]);
  const where = directoryWhere(
    { q: sp.q, classId: sp.class, houseId: sp.house, boarding: sp.boarding, status: sp.status },
    year.id,
  );
  const { rows, next, prev, total } = await cursorList<Row>(
    db.student,
    { where, include: directoryInclude },
    p,
  );
  const qs = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => !!e[1] && !["after", "before"].includes(e[0])),
  );
  return (
    <>
      <PageHeader
        title="Students"
        description={`${total} ${sp.status ? sp.status.toLowerCase() : "on roll"} · ${year.name}`}
        actions={
          can(user.role, "students:export") && (
            <a
              href={`/api/admin/students/export?${qs.toString()}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-sunken"
            >
              <Download className="size-4" aria-hidden /> Export CSV
            </a>
          )
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search students",
            placeholder: "Name, admission no., parent name or phone…",
          },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            type: "select",
            name: "house",
            label: "House",
            options: houses.map((h) => ({ value: h.id, label: h.name })),
          },
          {
            type: "select",
            name: "boarding",
            label: "Boarding",
            options: Object.entries(BOARDING_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: ["PROSPECTIVE", "WITHDRAWN", "TRANSFERRED", "ALUMNA"].map((s) => ({
              value: s,
              label: s.toLowerCase(),
            })),
          },
        ]}
      />
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="lastName" label="Pupil" current={p.sort} dir={p.dir} />
                <SortTh sp={sp} field="class.order" label="Class" current={p.sort} dir={p.dir} />
                <Th>House</Th>
                <Th>Boarding</Th>
                <Th>Parent</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((s) => {
                const g = s.guardians[0]?.guardian;
                return (
                  <Tr key={s.id} data-row>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-fg"
                        >
                          {initials(`${s.firstName} ${s.lastName}`)}
                        </span>
                        <span>
                          <Link
                            data-row-link
                            href={`/admin/students/${s.id}`}
                            className="font-medium hover:underline"
                          >
                            {s.firstName} {s.lastName}
                          </Link>
                          <span className="block text-xs text-muted">{s.admissionNo}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      {s.class.name}
                      {s.section && <span className="text-muted"> {s.section.name}</span>}
                    </Td>
                    <Td>
                      {s.house ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full"
                            style={{ background: s.house.colour }}
                          />
                          {s.house.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-muted">{BOARDING_LABEL[s.boardingType].replace(" boarding", "")}</Td>
                    <Td className="text-sm">
                      {g?.name ?? "—"}
                      {g?.phone && <span className="block text-xs text-muted">{g.phone}</span>}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          s.status === "ACTIVE" ? "success" : s.status === "PROSPECTIVE" ? "info" : "neutral"
                        }
                      >
                        {s.status === "PROSPECTIVE" ? "joining" : s.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No students match" />
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
