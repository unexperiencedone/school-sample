import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { sendCircularAction } from "../content/actions";

export const metadata = { title: "Circulars" };

/** Circulars appear in every parent's portal and go out by email (and WhatsApp where families have opted in). */
export default async function Circulars() {
  const user = await requireStaff("comms:read");
  const [circulars, classes, sentCounts] = await Promise.all([
    db.announcement.findMany({ where: { kind: "CIRCULAR" }, orderBy: { publishedAt: "desc" }, take: 30 }),
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.outbox.groupBy({ by: ["relatedId", "status"], where: { relatedType: "circular" }, _count: true }),
  ]);
  const count = (id: string, status?: string) =>
    sentCounts
      .filter((c) => c.relatedId === id && (!status || c.status === status))
      .reduce((a, c) => a + c._count, 0);
  return (
    <>
      <PageHeader
        title="Circulars"
        description="Letters to families: published in the parent portal and delivered by email and WhatsApp, respecting each family's choices."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <CardHeader>
            <CardTitle>Sent</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-line">
            {circulars.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <details>
                  <summary className="cursor-pointer list-none">
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-sm text-muted">
                      {formatDate(c.publishedAt, "d MMM yyyy")}
                      {count(c.id) > 0 &&
                        ` · ${count(c.id, "SENT")} delivered, ${count(c.id, "SKIPPED")} skipped (no consent)`}
                    </span>
                  </summary>
                  <p className="mt-3 text-sm whitespace-pre-line">{c.body}</p>
                </details>
              </li>
            ))}
          </ul>
        </Card>
        {can(user.role, "comms:send") && (
          <Card>
            <CardHeader>
              <CardTitle>New circular</CardTitle>
            </CardHeader>
            <CardBody>
              <ActionForm
                action={sendCircularAction}
                resetOnSuccess
                confirm="Publish this circular and send it to families now?"
                className="space-y-3 text-sm"
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Title</span>
                  <Input name="title" required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Letter</span>
                  <Textarea name="body" rows={8} required placeholder="Dear parents, …" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">To</span>
                  <Select name="audience" defaultValue="ALL">
                    <option value="ALL">All families</option>
                    <option value="BOARDERS">Boarding families</option>
                    {classes.map((c) => (
                      <option key={c.id} value={`CLASS:${c.id}`}>
                        {c.name} families
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="whatsapp" defaultChecked className="size-4" /> Also send a
                  WhatsApp alert (families who opted in)
                </label>
                <Button type="submit" size="sm">
                  Publish and send
                </Button>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
