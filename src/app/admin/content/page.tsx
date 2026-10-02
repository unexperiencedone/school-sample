import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveBarAction } from "./actions";

export const metadata = { title: "Announcement bar" };

function BarFields({
  d,
}: {
  d?: {
    title: string;
    body: string;
    href: string | null;
    active: boolean;
    order: number;
    expiresAt: Date | null;
  };
}) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Title</span>
          <Input name="title" defaultValue={d?.title} required maxLength={60} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Message (≤ 160 characters)</span>
          <Input name="body" defaultValue={d?.body} required maxLength={160} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_6rem]">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Link (/page or https://…)</span>
          <Input name="href" defaultValue={d?.href ?? ""} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Hide after</span>
          <Input
            type="date"
            name="expiresAt"
            defaultValue={d?.expiresAt ? formatDate(d.expiresAt, "yyyy-MM-dd") : ""}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Order</span>
          <Input name="order" defaultValue={String(d?.order ?? 0)} inputMode="numeric" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={d?.active ?? true} className="size-4" /> Show on
        the website
      </label>
    </>
  );
}

/** The thin bar across the top of every public page. Items rotate in order; expired ones hide themselves. */
export default async function ContentPage() {
  await requireStaff("content:write");
  const items = await db.announcement.findMany({
    where: { kind: "BAR" },
    orderBy: [{ active: "desc" }, { order: "asc" }],
  });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Announcement bar"
        description="Short notices shown across the top of the website. Changes are live within seconds."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-3">
          {items.map((i) => {
            const live = i.active && (!i.expiresAt || i.expiresAt > now);
            return (
              <Card key={i.id}>
                <CardHeader>
                  <CardTitle>{i.title}</CardTitle>
                  <Badge tone={live ? "success" : "neutral"}>
                    {live ? "live" : i.active ? "expired" : "hidden"}
                  </Badge>
                </CardHeader>
                <CardBody>
                  <ActionForm action={saveBarAction.bind(null, i.id)} className="space-y-3">
                    <BarFields d={i} />
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </ActionForm>
                </CardBody>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Add a notice</CardTitle>
          </CardHeader>
          <CardBody>
            <ActionForm action={saveBarAction.bind(null, null)} resetOnSuccess className="space-y-3">
              <BarFields />
              <Button type="submit" size="sm">
                Add
              </Button>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
