import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { saveEventAction } from "../actions";

export const metadata = { title: "Events & pop-up" };

const KINDS = [
  ["OPEN_HOUSE", "Open house"],
  ["ADMISSIONS_TALK", "Admissions talk"],
  ["CAMPUS_TOUR", "Campus tour"],
  ["SCHOOL_EVENT", "School event"],
] as const;

type E = {
  title: string;
  kind: string;
  summary: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  published: boolean;
  showInModal: boolean;
};
const local = (d: Date) => formatDate(d, "yyyy-MM-dd'T'HH:mm");

function EventFields({ e }: { e?: E }) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-muted">Title</span>
        <Input name="title" defaultValue={e?.title} required />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Type</span>
        <Select name="kind" defaultValue={e?.kind ?? "OPEN_HOUSE"}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Where</span>
        <Input name="location" defaultValue={e?.location} required />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Starts (IST)</span>
        <Input type="datetime-local" name="startsAt" defaultValue={e ? local(e.startsAt) : ""} required />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Ends (IST)</span>
        <Input type="datetime-local" name="endsAt" defaultValue={e ? local(e.endsAt) : ""} required />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-muted">Summary</span>
        <Textarea name="summary" defaultValue={e?.summary} rows={2} required />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="published" defaultChecked={e?.published ?? true} className="size-4" />{" "}
        Published on the website
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="showInModal"
          defaultChecked={e?.showInModal ?? false}
          className="size-4"
        />{" "}
        Feature in the website pop-up
      </label>
    </div>
  );
}

/** Open houses, talks and school events on the website calendar; one can drive the visitor pop-up. */
export default async function EventsAdmin() {
  await requireStaff("content:write");
  const events = await db.event.findMany({
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { slots: true } } },
  });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Events & pop-up"
        description="Shown on the Events page and the homepage. The featured event appears once per visit as a pop-up with a booking form."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-3">
          {events.map((e) => (
            <details key={e.id} className="group rounded-lg border border-line bg-elevated">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
                <span>
                  <span className="font-medium">{e.title}</span>
                  <span className="block text-sm text-muted">
                    {formatDate(e.startsAt, "EEE d MMM yyyy, h:mm a")} · {e.location}
                  </span>
                </span>
                <span className="flex gap-1">
                  {e.showInModal && <Badge tone="accent">pop-up</Badge>}
                  <Badge tone={!e.published ? "neutral" : e.endsAt < now ? "neutral" : "success"}>
                    {!e.published ? "draft" : e.endsAt < now ? "past" : "upcoming"}
                  </Badge>
                </span>
              </summary>
              <div className="border-t border-line p-5">
                <ActionForm action={saveEventAction.bind(null, e.id)} className="space-y-3">
                  <EventFields e={e} />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>New event</CardTitle>
          </CardHeader>
          <CardBody>
            <ActionForm action={saveEventAction.bind(null, null)} resetOnSuccess className="space-y-3">
              <EventFields />
              <Button type="submit" size="sm">
                Create
              </Button>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
