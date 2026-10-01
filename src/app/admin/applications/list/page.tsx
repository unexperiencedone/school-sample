import Link from "next/link";
import type { ApplicationStage, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cursorList, parseListParams } from "@/lib/crm/list";
import { STAGE_LABEL, TRANSITIONS } from "@/lib/services/admissions";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { TableKeys } from "@/components/crm/table/table-keys";
import { StageBadge } from "@/components/crm/badges";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Applications" };
const include = { class: true, startYear: true } satisfies Prisma.ApplicationInclude;
type Row = Prisma.ApplicationGetPayload<{ include: typeof include }>;

export default async function ApplicationsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("applications:read");
  const sp = await searchParams;
  const p = parseListParams(sp, {
    sorts: ["createdAt", "childFirstName", "stage", "updatedAt"],
    defaultSort: "createdAt",
  });
  const stages = Object.keys(TRANSITIONS) as ApplicationStage[];
  const where: Prisma.ApplicationWhereInput = {
    ...(sp.stage && stages.includes(sp.stage as ApplicationStage)
      ? { stage: sp.stage as ApplicationStage }
      : { stage: { not: "DRAFT" } }),
    ...(sp.class ? { classId: sp.class } : {}),
    ...(sp.docs === "pending"
      ? { documents: { some: { status: "PENDING" as const, fileKey: { not: null } } } }
      : {}),
    ...(sp.boarding ? { boardingType: sp.boarding as "FULL" | "FLEXI" | "DAY" } : {}),
    ...(sp.q
      ? {
          OR: [
            { ref: { contains: sp.q, mode: "insensitive" } },
            { childFirstName: { contains: sp.q, mode: "insensitive" } },
            { childLastName: { contains: sp.q, mode: "insensitive" } },
            { contactEmail: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [{ rows, next, prev, total }, classes] = await Promise.all([
    cursorList<Row>(db.application, { where, include }, p),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="All applications" description="Search, filter and open any application." />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search applications",
            placeholder: "Ref, child name or email…",
          },
          {
            type: "select",
            name: "stage",
            label: "Stage",
            options: stages.map((s) => ({ value: s, label: STAGE_LABEL[s] })),
          },
          {
            type: "select",
            name: "class",
            label: "Class",
            options: classes.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            type: "select",
            name: "boarding",
            label: "Boarding",
            options: [
              { value: "FULL", label: "Full" },
              { value: "FLEXI", label: "Flexi" },
              { value: "DAY", label: "Day" },
            ],
          },
          {
            type: "select",
            name: "docs",
            label: "Documents",
            options: [{ value: "pending", label: "Awaiting verification" }],
          },
        ]}
      />
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="childFirstName" label="Child" current={p.sort} dir={p.dir} />
                <Th>Ref</Th>
                <Th>Class</Th>
                <Th>Session</Th>
                <Th>Boarding</Th>
                <SortTh sp={sp} field="stage" label="Stage" current={p.sort} dir={p.dir} />
                <Th>Contact</Th>
                <SortTh sp={sp} field="createdAt" label="Registered" current={p.sort} dir={p.dir} />
              </tr>
            </THead>
            <tbody>
              {rows.map((a) => (
                <Tr key={a.id} data-row>
                  <Td>
                    <Link
                      data-row-link
                      href={`/admin/applications/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.childFirstName} {a.childLastName}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{a.ref}</Td>
                  <Td>{a.class.name}</Td>
                  <Td>{a.startYear.name}</Td>
                  <Td className="capitalize">{a.boardingType.toLowerCase()}</Td>
                  <Td>
                    <StageBadge stage={a.stage} />
                  </Td>
                  <Td className="text-muted">{a.contactEmail}</Td>
                  <Td className="text-muted">{formatDate(a.registrationPaidAt ?? a.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No applications match" />
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
