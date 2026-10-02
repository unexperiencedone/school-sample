import { requireStaff } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { parseListParams } from "@/lib/crm/list";
import { listStaff, staffFacets, STAFF_SORTS } from "@/lib/services/careers-admin";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { StaffEditButton } from "./staff-edit";

export const metadata = { title: "Staff directory" };

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("careers:read");
  const sp = await searchParams;
  const canWrite = can(user.role, "careers:write");
  const p = parseListParams(sp, { sorts: STAFF_SORTS, defaultSort: "lastName", defaultDir: "asc", take: 50 });
  const [facets, { rows, next, prev, total }] = await Promise.all([
    staffFacets(user),
    listStaff(
      user,
      { q: sp.q, department: sp.department, designation: sp.designation, status: sp.status },
      p,
    ),
  ]);
  return (
    <>
      <PageHeader
        title="Staff directory"
        description={`${total} staff member${total === 1 ? "" : "s"}. New colleagues are added from a hired application.`}
      />
      <FilterBar
        className="mb-4"
        fields={[
          {
            type: "search",
            name: "q",
            label: "Search staff",
            placeholder: "Name, email, designation or department…",
          },
          {
            type: "select",
            name: "department",
            label: "Department",
            options: facets.departments.map((d) => ({ value: d, label: d })),
          },
          {
            type: "select",
            name: "designation",
            label: "Role",
            options: facets.designations.map((d) => ({ value: d, label: d })),
          },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: [
              { value: "active", label: "In post" },
              { value: "inactive", label: "Left" },
            ],
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="lastName" label="Name" current={p.sort} dir={p.dir} />
                <SortTh sp={sp} field="designation" label="Role" current={p.sort} dir={p.dir} />
                <SortTh sp={sp} field="department" label="Department" current={p.sort} dir={p.dir} />
                <Th>Contact</Th>
                <SortTh sp={sp} field="joinedOn" label="Joined" current={p.sort} dir={p.dir} />
                <Th>Status</Th>
                {canWrite && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </tr>
            </THead>
            <tbody>
              {rows.map((s) => {
                const name = `${s.firstName} ${s.lastName}`;
                return (
                  <Tr key={s.id} data-testid={`staff-${s.id}`}>
                    <Td>
                      <span className="font-medium">{name}</span>
                      {s.subjects.length > 0 && (
                        <span className="block text-xs text-muted">
                          {s.subjects.map((x) => x.name).join(", ")}
                        </span>
                      )}
                    </Td>
                    <Td>{s.designation}</Td>
                    <Td>{s.department}</Td>
                    <Td className="text-sm">
                      <a href={`mailto:${s.email}`} className="underline">
                        {s.email}
                      </a>
                      {s.phone && <span className="block text-xs text-muted">{s.phone}</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(s.joinedOn)}</Td>
                    <Td>
                      <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "In post" : "Left"}</Badge>
                      {s.user && (
                        <span className="mt-1 block text-xs text-muted">
                          CRM login: {ROLE_LABELS[s.user.role]}
                        </span>
                      )}
                    </Td>
                    {canWrite && (
                      <Td>
                        <StaffEditButton
                          id={s.id}
                          name={name}
                          designation={s.designation}
                          department={s.department}
                          phone={s.phone ?? ""}
                        />
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No staff match">Try clearing the filters.</EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}
