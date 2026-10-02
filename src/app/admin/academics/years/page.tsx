import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateTermAction } from "../actions";
import { MakeCurrent } from "./year-switch";

export const metadata = { title: "Years & terms" };

export default async function YearsPage() {
  const user = await requireStaff("academics:read");
  const years = await db.academicYear.findMany({
    orderBy: { startDate: "asc" },
    include: {
      terms: { orderBy: { startDate: "asc" } },
      _count: { select: { sections: true, invoices: true, applications: true } },
    },
  });
  const canWrite = can(user.role, "academics:write");
  return (
    <>
      <PageHeader
        title="Years & terms"
        description="Academic years run April to March. Term dates drive pocket-money top-ups, reports and the website calendar."
      />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {years.map((y) => (
          <Card key={y.id}>
            <CardHeader>
              <CardTitle>{y.name}</CardTitle>
              {y.isCurrent ? (
                <Badge tone="success">current</Badge>
              ) : (
                can(user.role, "settings:write") && <MakeCurrent id={y.id} name={y.name} />
              )}
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <p className="text-muted">
                {formatDate(y.startDate)} – {formatDate(y.endDate)} · {y._count.sections} sections ·{" "}
                {y._count.invoices} invoices · {y._count.applications} applications
              </p>
              {y.terms.map((t) =>
                canWrite ? (
                  <ActionForm
                    key={t.id}
                    action={updateTermAction.bind(null, t.id)}
                    className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-sunken p-3"
                  >
                    <Input
                      name="name"
                      defaultValue={t.name}
                      aria-label="Term name"
                      className="col-span-2 h-8"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        name="startDate"
                        defaultValue={t.startDate.toISOString().slice(0, 10)}
                        aria-label={`${t.name} starts`}
                        className="h-8"
                      />
                      <Input
                        type="date"
                        name="endDate"
                        defaultValue={t.endDate.toISOString().slice(0, 10)}
                        aria-label={`${t.name} ends`}
                        className="h-8"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </ActionForm>
                ) : (
                  <p key={t.id}>
                    <span className="font-medium">{t.name}</span>{" "}
                    <span className="text-muted">
                      {formatDate(t.startDate)} – {formatDate(t.endDate)}
                    </span>
                  </p>
                ),
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
