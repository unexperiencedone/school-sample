import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { updateHeadAction } from "../actions";

export const metadata = { title: "Fee heads" };

const KIND: Record<string, string> = {
  REGISTRATION: "Registration",
  ADMISSION: "Admission",
  TUITION: "Tuition",
  BOARDING: "Boarding",
  ACTIVITY: "Activities",
  BOOKS: "Books",
  EXAM: "Examinations",
  UNIFORM: "Uniform",
  TRANSPORT: "Transport",
  OTHER: "Other",
};

/** The building blocks of every structure. Amounts live on structure versions; heads carry behaviour. */
export default async function HeadsPage() {
  const user = await requireStaff("fees:read");
  const editable = can(user.role, "fees:revise");
  const heads = await db.feeHead.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { lines: true } } },
  });
  return (
    <>
      <PageHeader
        title="Fee heads"
        description="What each charge is and how it behaves: recurring or one-time, refundable or not. Amounts are set per structure version."
      />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        <Table>
          <THead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Kind</Th>
              <Th>Charged</Th>
              <Th>Refundable</Th>
              <Th className="text-right">Used in</Th>
              {editable && <Th className="w-24" />}
            </tr>
          </THead>
          <tbody>
            {heads.map((h) => (
              <Tr key={h.id}>
                <Td className="font-mono text-xs">{h.code}</Td>
                <Td className="font-medium">
                  {h.name} {!h.active && <Badge tone="neutral">inactive</Badge>}
                </Td>
                <Td>{KIND[h.kind] ?? h.kind}</Td>
                <Td className="text-muted">{h.oneTime ? "Once, on admission" : "Every year"}</Td>
                <Td>
                  {h.refundable ? (
                    <Badge tone="success">refundable</Badge>
                  ) : (
                    <Badge tone="neutral">non-refundable</Badge>
                  )}
                </Td>
                <Td className="text-right text-muted tabular-nums">{h._count.lines} versions</Td>
                {editable && (
                  <Td>
                    <details className="group relative">
                      <summary className="cursor-pointer list-none text-sm text-primary underline">
                        Edit
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-elevated p-4 shadow-lift">
                        <ActionForm action={updateHeadAction.bind(null, h.id)} className="space-y-3">
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs text-muted">Name</span>
                            <Input name="name" defaultValue={h.name} required />
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="refundable"
                              defaultChecked={h.refundable}
                              className="size-4"
                            />{" "}
                            Refundable
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="active"
                              defaultChecked={h.active}
                              className="size-4"
                            />{" "}
                            Active (available to new versions)
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-xs text-muted">Reason</span>
                            <Input name="reason" required minLength={5} />
                          </label>
                          <Button type="submit" size="sm">
                            Save
                          </Button>
                        </ActionForm>
                      </div>
                    </details>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
