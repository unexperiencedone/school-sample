import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, istDateOnly } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PaymentForm } from "./payment-form";

export const metadata = { title: "Record a payment" };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; instalment?: string }>;
}) {
  await requireStaff("payments:record");
  const sp = await searchParams;
  const students = await db.student.findMany({
    where: { status: { in: ["ACTIVE", "PROSPECTIVE"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      status: true,
      class: { select: { name: true, order: true } },
    },
    orderBy: [{ class: { order: "asc" } }, { firstName: "asc" }],
  });
  const student = students.find((s) => s.id === sp.student) ?? null;
  const today = istDateOnly(new Date());
  const instalments = student
    ? await db.instalment.findMany({
        where: {
          invoice: { studentId: student.id, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
          status: { notIn: ["PAID", "WAIVED"] },
        },
        include: { invoice: { select: { number: true } } },
        orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
      })
    : [];
  return (
    <>
      <PageHeader
        title="Record a payment"
        description="For cheques, demand drafts, bank transfers and cash. Online payments are recorded automatically by the gateway."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <PaymentForm
            key={student?.id ?? "none"}
            students={students.map((s) => ({
              id: s.id,
              group: s.class.name,
              label: `${s.firstName} ${s.lastName} (${s.admissionNo}${s.status === "PROSPECTIVE" ? ", joining" : ""})`,
            }))}
            studentId={student?.id ?? null}
            instalments={instalments
              .map((i) => ({
                id: i.id,
                label: `${i.invoice.number} · ${i.label} · due ${formatDate(i.dueDate)}`,
                outstandingPaise: i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise) - i.paidPaise,
                overdue: i.dueDate < today,
              }))
              .filter((i) => i.outstandingPaise > 0)}
            defaultInstalment={sp.instalment ?? null}
            today={today.toISOString().slice(0, 10)}
          />
        </CardBody>
      </Card>
    </>
  );
}
