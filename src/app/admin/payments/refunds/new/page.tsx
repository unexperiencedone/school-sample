import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, istDateOnly } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { RefundForm } from "./refund-form";

export const metadata = { title: "New refund request" };

export default async function NewRefundPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; payment?: string }>;
}) {
  await requireStaff("refunds:request");
  const sp = await searchParams;
  const fromPayment = sp.payment
    ? await db.payment.findUnique({ where: { id: sp.payment }, select: { studentId: true } })
    : null;
  const studentId = sp.student ?? fromPayment?.studentId ?? null;
  const students = await db.student.findMany({
    where: { payments: { some: { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } } } },
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
  const payments = studentId
    ? await db.payment.findMany({
        where: { studentId, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } },
        include: { receipt: true, refunds: true },
        orderBy: { receivedAt: "desc" },
      })
    : [];
  return (
    <>
      <PageHeader
        title="New refund request"
        description="Quote it under the refund policy, then send it for approval. Nothing is paid until a second person approves."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <RefundForm
            key={studentId ?? "none"}
            students={students.map((s) => ({
              id: s.id,
              group: s.class.name,
              label: `${s.firstName} ${s.lastName} (${s.admissionNo}${s.status !== "ACTIVE" ? `, ${s.status.toLowerCase()}` : ""})`,
            }))}
            studentId={studentId}
            payments={payments
              .map((p) => {
                const committed = p.refunds
                  .filter((r) => ["REQUESTED", "APPROVED", "PROCESSED"].includes(r.status))
                  .reduce((a, r) => a + r.amountPaise, 0);
                return {
                  id: p.id,
                  label: `${p.receipt?.number ?? "—"} · ${formatDate(p.receivedAt)} · ${formatINR(p.amountPaise)}`,
                  availablePaise: p.amountPaise - committed,
                };
              })
              .filter((p) => p.availablePaise > 0)}
            defaultPayment={sp.payment ?? null}
            today={istDateOnly(new Date()).toISOString().slice(0, 10)}
          />
        </CardBody>
      </Card>
    </>
  );
}
