import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { listVacancies } from "@/lib/services/careers-admin";
import { vacancyIsLive } from "@/lib/services/careers-admin-rules";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { EmptyState } from "@/components/ui/states";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { VacancyStatusBadge } from "../badges";
import { VacancyStatusButton } from "./vacancy-controls";

export const metadata = { title: "Vacancies" };

export default async function VacanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff("careers:read");
  const sp = await searchParams;
  const canWrite = can(user.role, "careers:write");
  const now = new Date();
  const vacancies = await listVacancies(user, { q: sp.q, status: sp.status });
  const suggested = formatDate(new Date(now.getTime() + 28 * 86400_000), "yyyy-MM-dd");
  return (
    <>
      <PageHeader
        title="Vacancies"
        description="The roles advertised on the public careers pages. An open vacancy with a closing date still ahead is live on the website."
        actions={
          canWrite && (
            <Link
              href="/admin/careers/vacancies/new"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              <Plus className="size-4" aria-hidden /> New vacancy
            </Link>
          )
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          { type: "search", name: "q", label: "Search vacancies", placeholder: "Title or department…" },
          {
            type: "select",
            name: "status",
            label: "Status",
            options: [
              { value: "OPEN", label: "Open" },
              { value: "DRAFT", label: "Draft" },
              { value: "CLOSED", label: "Closed" },
            ],
          },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {vacancies.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Vacancy</Th>
                <Th>Status</Th>
                <Th>Closes</Th>
                <Th>Applications</Th>
                {canWrite && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </tr>
            </THead>
            <tbody>
              {vacancies.map((v) => {
                const live = vacancyIsLive(v, now);
                const expired = v.closesAt < now;
                return (
                  <Tr key={v.id} data-testid={`vacancy-${v.slug}`}>
                    <Td>
                      {canWrite ? (
                        <Link
                          href={`/admin/careers/vacancies/${v.id}`}
                          className="font-medium hover:underline"
                        >
                          {v.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{v.title}</span>
                      )}
                      <span className="block text-xs text-muted">
                        {v.department} · {v.employment}
                      </span>
                    </Td>
                    <Td>
                      <VacancyStatusBadge status={v.status} />
                      <span className="mt-1 block text-xs text-muted">
                        {live
                          ? "Live on the website"
                          : v.status === "OPEN"
                            ? "Not shown: closing date has passed"
                            : "Not on the website"}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(v.closesAt)}</Td>
                    <Td>
                      {v.submittedApplications > 0 ? (
                        <Link href={`/admin/careers?view=table&vacancy=${v.id}`} className="underline">
                          {v.submittedApplications}
                        </Link>
                      ) : (
                        "0"
                      )}
                      {v.totalApplications > v.submittedApplications && (
                        <span className="block text-xs text-muted">
                          +{v.totalApplications - v.submittedApplications} draft
                          {v.totalApplications - v.submittedApplications === 1 ? "" : "s"}
                        </span>
                      )}
                    </Td>
                    {canWrite && (
                      <Td>
                        <VacancyStatusButton
                          id={v.id}
                          title={v.title}
                          open={v.status === "OPEN"}
                          needsNewDate={expired}
                          suggestedDate={suggested}
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
            <EmptyState title="No vacancies match">Create one, or clear the filters.</EmptyState>
          </div>
        )}
      </div>
    </>
  );
}
