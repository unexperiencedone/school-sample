import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { getVacancy, vacancyDepartments } from "@/lib/services/careers-admin";
import { vacancyIsLive } from "@/lib/services/careers-admin-rules";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { VacancyStatusBadge } from "../../badges";
import { VacancyForm } from "../vacancy-form";
import { DeleteVacancyButton } from "../vacancy-controls";

export const metadata = { title: "Edit vacancy" };

export default async function EditVacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("careers:write");
  const { id } = await params;
  const [v, departments] = await Promise.all([getVacancy(user, id), vacancyDepartments(user)]);
  if (!v) notFound();
  const live = vacancyIsLive(v, new Date());
  return (
    <>
      <PageHeader
        eyebrow="Vacancies"
        title={v.title}
        description={
          <>
            <VacancyStatusBadge status={v.status} />{" "}
            {live ? (
              <Link href={`/careers/vacancies/${v.slug}`} className="underline">
                Live on the website
              </Link>
            ) : v.status === "OPEN" ? (
              "Not shown on the website: the closing date has passed."
            ) : (
              "Not on the website."
            )}{" "}
            {v.totalApplications > 0 && (
              <Link href={`/admin/careers?view=table&vacancy=${v.id}`} className="underline">
                {v.totalApplications} application{v.totalApplications === 1 ? "" : "s"}
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardBody>
            <VacancyForm
              id={v.id}
              departments={departments}
              initial={{
                title: v.title,
                slug: v.slug,
                department: v.department,
                employment: v.employment,
                location: v.location,
                summary: v.summary,
                description: v.description,
                requirements: v.requirements,
                closesAt: formatDate(v.closesAt, "yyyy-MM-dd"),
                status: v.status,
              }}
            />
          </CardBody>
        </Card>
        <Card className="h-fit min-w-0">
          <CardHeader>
            <CardTitle>Delete</CardTitle>
          </CardHeader>
          <CardBody>
            <DeleteVacancyButton id={v.id} title={v.title} applications={v.totalApplications} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
