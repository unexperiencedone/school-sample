import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readMedical } from "@/lib/services/students";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { updateMedicalAction } from "../../actions";

export const metadata = { title: "Medical record", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Sensitive personal data: separate page, separate permission, every view audit-logged. */
export default async function MedicalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("students:medical");
  const { id } = await params;
  const student = await db.student.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
  });
  if (!student) notFound();
  const m = await readMedical(user, id);
  const fields: [string, string, string | null | undefined, boolean?][] = [
    ["bloodGroup", "Blood group", m?.bloodGroup],
    ["allergies", "Allergies", m?.allergies, true],
    ["conditions", "Conditions", m?.conditions, true],
    ["medications", "Medications", m?.medications, true],
    ["doctorName", "Family doctor", m?.doctorName],
    ["doctorPhone", "Doctor's phone", m?.doctorPhone],
    ["notes", "Care notes", m?.notes, true],
  ];
  return (
    <>
      <PageHeader
        eyebrow={`Medical record · ${student.admissionNo}`}
        title={`${student.firstName} ${student.lastName}`}
        description="Confidential. Your access has been recorded in the audit log."
        actions={
          <Link href={`/admin/students/${id}`} className="text-sm underline">
            Back to profile
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <CardBody>
          <ActionForm action={updateMedicalAction.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
            {fields.map(([name, label, value, long]) => (
              <label key={name} className={long ? "sm:col-span-2" : undefined}>
                <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
                {long ? (
                  <Textarea name={name} defaultValue={value ?? ""} rows={2} />
                ) : (
                  <Input name={name} defaultValue={value ?? ""} />
                )}
              </label>
            ))}
            <div>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
