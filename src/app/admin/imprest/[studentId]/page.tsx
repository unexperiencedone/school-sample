import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { IMPREST_CATEGORIES, ledger } from "@/lib/services/imprest";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { addEntryAction } from "../actions";

export const metadata = { title: "Pocket-money ledger" };

export default async function ImprestLedgerPage({ params }: { params: Promise<{ studentId: string }> }) {
  const user = await requireStaff("imprest:read");
  const { studentId } = await params;
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: { class: true, house: true },
  });
  if (!student) notFound();
  const rows = await ledger(studentId);
  const balance = rows.at(-1)?.balance ?? 0;
  return (
    <>
      <PageHeader
        eyebrow="Pocket money"
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.class.name} · ${student.boardingType === "FULL" ? "Full" : student.boardingType === "FLEXI" ? "Flexi" : "Day"} boarder${student.house ? ` · ${student.house.name}` : ""}`}
        actions={
          <Link href={`/admin/students/${studentId}`} className="text-sm underline">
            Profile
          </Link>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
            <span className="text-sm">
              Balance <span className="font-semibold tabular-nums">{formatINR(balance)}</span>
            </span>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Item</Th>
                <Th>Term</Th>
                <Th className="text-right">In</Th>
                <Th className="text-right">Out</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </THead>
            <tbody>
              {[...rows].reverse().map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatDate(e.createdAt)}</Td>
                  <Td>
                    {e.description}
                    <span className="block text-xs text-muted">
                      {IMPREST_CATEGORIES[e.category as keyof typeof IMPREST_CATEGORIES] ?? e.category}
                    </span>
                  </Td>
                  <Td className="text-xs text-muted">{e.term?.name ?? "—"}</Td>
                  <Td className="text-right text-success tabular-nums">
                    {e.kind === "CREDIT" ? formatINR(e.amountPaise) : ""}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.kind === "EXPENSE" ? formatINR(e.amountPaise) : ""}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{formatINR(e.balance)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {can(user.role, "imprest:write") && student.boardingType !== "DAY" && (
          <Card>
            <CardHeader>
              <CardTitle>Add an entry</CardTitle>
            </CardHeader>
            <CardBody>
              <ActionForm
                action={addEntryAction.bind(null, studentId)}
                resetOnSuccess
                className="space-y-3 text-sm"
              >
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1 block text-xs text-muted">Type</span>
                    <Select name="kind" defaultValue="EXPENSE">
                      <option value="EXPENSE">Expense</option>
                      <option value="CREDIT">Credit</option>
                    </Select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-muted">Category</span>
                    <Select name="category" defaultValue="TUCK_SHOP">
                      {Object.entries(IMPREST_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Amount (₹)</span>
                  <Input name="amount" inputMode="decimal" required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Description</span>
                  <Input name="description" required placeholder="e.g. Saturday outing to the lake" />
                </label>
                <Button type="submit" size="sm">
                  Add
                </Button>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
