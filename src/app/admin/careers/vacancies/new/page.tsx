import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { vacancyDepartments } from "@/lib/services/careers-admin";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { VacancyForm } from "../vacancy-form";

export const metadata = { title: "New vacancy" };

export default async function NewVacancyPage() {
  const user = await requireStaff("careers:write");
  const departments = await vacancyDepartments(user);
  return (
    <>
      <PageHeader
        eyebrow="Vacancies"
        title="New vacancy"
        description="Set it to Open for it to appear on the careers pages straight away, or save it as a draft."
      />
      <Card className="max-w-4xl">
        <CardBody>
          <VacancyForm
            departments={departments}
            initial={{
              title: "",
              slug: "",
              department: "",
              employment: "Full-time",
              location: "Kesarbagh campus (sample)",
              summary: "",
              description: "",
              requirements: [],
              closesAt: formatDate(new Date(Date.now() + 28 * 86400_000), "yyyy-MM-dd"),
              status: "OPEN",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
