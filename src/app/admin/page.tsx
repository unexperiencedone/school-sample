import Link from "next/link";
import type { Role } from "@prisma/client";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, Info } from "lucide-react";
import { requireStaff, type CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { firstName } from "@/lib/utils";
import { TZDate } from "@date-fns/tz";
import { SCHOOL_TZ } from "@/lib/dates";
import {
  admissionsKpis,
  applicationsByStage,
  boardingSnapshot,
  dashboardYears,
  enquiriesByWeek,
  financeKpis,
  hrKpis,
  leadSources,
  monthlyCollections,
  registrarKpis,
  seatsForIntake,
  teachingDay,
  todaysTasks,
  upcomingEvents,
  upcomingInstalments,
  type Kpi,
  type Task,
} from "@/lib/services/dashboard";
import { PERIOD_TIMES } from "@/config/timetable";
import { PageHeader } from "@/components/crm/page-header";
import { ChartCard, Legend } from "@/components/charts/chart-card";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { SeatMeters } from "@/components/charts/seat-meters";
import { Meter, StatTile } from "@/components/charts/stat-tile";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Focus = "overview" | "admissions" | "finance" | "registrar" | "teaching" | "boarding" | "people";
const FOCUS: Record<Role, Focus> = {
  SUPER_ADMIN: "overview",
  PRINCIPAL: "overview",
  ADMISSIONS: "admissions",
  ACCOUNTS: "finance",
  REGISTRAR: "registrar",
  TEACHER: "teaching",
  HOUSEPARENT: "boarding",
  HR: "people",
  PARENT: "overview",
  APPLICANT: "overview",
};

function greeting(now: Date) {
  const h = new TZDate(now.getTime(), SCHOOL_TZ).getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Role-aware home: each person sees the numbers and queues their role can act on. */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff("dashboard:view");
  const { denied } = await searchParams;
  const now = new Date();
  const focus = FOCUS[user.role];
  const years = await dashboardYears();
  const term = await db.term.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { name: true },
  });
  return (
    <>
      <PageHeader
        eyebrow={`${ROLE_LABELS[user.role]} dashboard`}
        title={`${greeting(now)}, ${firstName(user.name)}`}
        description={`${formatDate(now, "EEEE, d MMMM yyyy")} · ${years.current.name}${term ? ` · ${term.name}` : ""}`}
      />
      {denied && (
        <p
          role="status"
          className="mb-5 flex items-center gap-2 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          That page isn&apos;t available to your role ({ROLE_LABELS[user.role]}). Ask the Principal if you
          need access.
        </p>
      )}
      {focus === "overview" && <Overview user={user} now={now} years={years} />}
      {focus === "admissions" && <Admissions user={user} now={now} years={years} />}
      {focus === "finance" && <Finance user={user} now={now} years={years} />}
      {focus === "registrar" && <Registrar user={user} now={now} years={years} />}
      {focus === "teaching" && <Teaching user={user} now={now} />}
      {focus === "boarding" && <Boarding user={user} now={now} />}
      {focus === "people" && <People user={user} now={now} />}
    </>
  );
}

type Years = Awaited<ReturnType<typeof dashboardYears>>;
type Props = { user: CurrentUser; now: Date; years: Years };

/* ───────────────────────────── Layouts per role ───────────────────────────── */

async function Overview({ user, now, years }: Props) {
  const [adm, fin, stages, months, seats, weeks, sources, tasks, events] = await Promise.all([
    admissionsKpis(now, years.intake.id),
    financeKpis(now, years.current.id),
    applicationsByStage(),
    monthlyCollections(now),
    seatsForIntake(years.current.id, years.intake.id),
    enquiriesByWeek(now),
    leadSources(now),
    todaysTasks(user, now),
    upcomingEvents(now),
  ]);
  const kpis = [adm[0]!, adm[2]!, fin.kpis[0]!, fin.kpis[1]!];
  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      {/* Two independent stacks, so cards keep their natural height instead of stretching to a row. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <StagesCard data={stages} />
          <CollectionsCard data={months} />
          <EnquiriesCard data={weeks} />
        </div>
        <div className="min-w-0 space-y-5 max-lg:order-first">
          <TasksCard tasks={tasks} />
          <CollectionRateCard collection={fin.collection} yearName={years.current.name} />
          <EventsCard events={events} />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <SeatsCard rows={seats} intakeName={years.intake.name} className="lg:col-span-2" />
        <SourcesCard data={sources} />
      </div>
    </div>
  );
}

async function Admissions({ user, now, years }: Props) {
  const [kpis, stages, seats, weeks, sources, tasks, events] = await Promise.all([
    admissionsKpis(now, years.intake.id),
    applicationsByStage(),
    seatsForIntake(years.current.id, years.intake.id),
    enquiriesByWeek(now),
    leadSources(now),
    todaysTasks(user, now),
    upcomingEvents(now),
  ]);
  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <EnquiriesCard data={weeks} />
          <StagesCard data={stages} />
          <SeatsCard rows={seats} intakeName={years.intake.name} />
        </div>
        <div className="min-w-0 space-y-5 max-lg:order-first">
          <TasksCard tasks={tasks} />
          <SourcesCard data={sources} />
          <EventsCard events={events} />
        </div>
      </div>
    </div>
  );
}

async function Finance({ user, now, years }: Props) {
  const [fin, months, upcoming, tasks] = await Promise.all([
    financeKpis(now, years.current.id),
    monthlyCollections(now),
    upcomingInstalments(now),
    todaysTasks(user, now),
  ]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fin.kpis.map((k) => (
          <StatTile key={k.key} kpi={k} />
        ))}
        <div className="rounded-lg border border-line bg-elevated px-4 py-4">
          <CollectionRate collection={fin.collection} yearName={years.current.name} />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <CollectionsCard data={months} />
          <UpcomingInstalmentsCard rows={upcoming} />
        </div>
        <TasksCard tasks={tasks} />
      </div>
    </div>
  );
}

async function Registrar({ user, now, years }: Props) {
  const [kpis, seats, tasks, events] = await Promise.all([
    registrarKpis(now, years.current.id, years.current.startDate),
    seatsForIntake(years.current.id, years.intake.id),
    todaysTasks(user, now),
    upcomingEvents(now),
  ]);
  return (
    <div className="space-y-5">
      <KpiRow kpis={kpis} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <SeatsCard rows={seats} intakeName={years.intake.name} className="lg:col-span-2" />
        <div className="min-w-0 space-y-5 max-lg:order-first">
          <TasksCard tasks={tasks} />
          <EventsCard events={events} />
        </div>
      </div>
    </div>
  );
}

async function Teaching({ user, now }: { user: CurrentUser; now: Date }) {
  const [day, events] = await Promise.all([teachingDay(user.id, now), upcomingEvents(now, 5)]);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <section className="rounded-lg border border-line bg-elevated lg:col-span-2" aria-labelledby="tt-title">
        <header className="border-b border-line px-5 py-4">
          <h2 id="tt-title" className="text-[0.95rem] font-semibold text-fg">
            {day?.isToday === false ? "Your lessons on Monday" : "Your lessons today"}
          </h2>
          <p className="mt-0.5 text-xs text-muted">From the published timetable</p>
        </header>
        {day?.slots.length ? (
          <ol className="divide-y divide-line">
            {day.slots.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                <span className="w-24 shrink-0 text-sm text-muted tabular-nums">
                  P{s.period} · {PERIOD_TIMES[s.period]?.start}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">{s.subject.name}</span>
                  <span className="text-sm text-muted">
                    {s.section.class.name} {s.section.name}
                    {s.section.room ? ` · Room ${s.section.room}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 py-8 text-sm text-muted">No lessons on your timetable for this day.</p>
        )}
      </section>
      <EventsCard events={events} />
    </div>
  );
}

async function Boarding({ user, now }: { user: CurrentUser; now: Date }) {
  const [snap, events] = await Promise.all([boardingSnapshot(), upcomingEvents(now)]);
  const kpis: Kpi[] = [
    { key: "full", label: "Full boarders", value: String(snap.full) },
    { key: "flexi", label: "Flexi boarders", value: String(snap.flexi) },
    { key: "day", label: "Day pupils", value: String(snap.day) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <StatTile key={k.key} kpi={k} />
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section
          className="rounded-lg border border-line bg-elevated lg:col-span-2"
          aria-labelledby="imp-title"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="imp-title" className="text-[0.95rem] font-semibold text-fg">
                Lowest pocket-money balances
              </h2>
              <p className="mt-0.5 text-xs text-muted">Boarders whose imprest may need a top-up</p>
            </div>
            {can(user.role, "imprest:read") && <CardLink href="/admin/imprest">Imprest</CardLink>}
          </header>
          <Table>
            <THead>
              <tr>
                <Th>Pupil</Th>
                <Th>Class</Th>
                <Th>Boarding</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </THead>
            <tbody>
              {snap.low.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">
                    {s.firstName} {s.lastName}
                  </Td>
                  <Td>{s.class.name}</Td>
                  <Td className="text-muted">{s.boardingType === "FULL" ? "Full" : "Flexi"}</Td>
                  <Td className={cn("text-right tabular-nums", s.balance < 0 && "font-semibold text-danger")}>
                    {formatINR(s.balance)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
        <EventsCard events={events} />
      </div>
    </div>
  );
}

async function People({ user, now }: { user: CurrentUser; now: Date }) {
  const [kpis, tasks, events] = await Promise.all([hrKpis(now), todaysTasks(user, now), upcomingEvents(now)]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <StatTile key={k.key} kpi={k} />
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <TasksCard tasks={tasks} />
        <EventsCard events={events} />
      </div>
    </div>
  );
}

/* ───────────────────────────── Widgets ───────────────────────────── */

function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {kpis.map((k) => (
        <StatTile key={k.key} kpi={k} />
      ))}
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

function SimpleTable({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: (string | number)[][];
  align?: ("left" | "right")[];
}) {
  return (
    <Table>
      <THead>
        <tr>
          {head.map((h, i) => (
            <Th key={h} className={align?.[i] === "right" ? "text-right" : undefined}>
              {h}
            </Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {rows.map((r, ri) => (
          <Tr key={ri}>
            {r.map((c, ci) => (
              <Td key={ci} className={align?.[ci] === "right" ? "text-right tabular-nums" : undefined}>
                {c}
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function StagesCard({
  data,
  className,
}: {
  data: Awaited<ReturnType<typeof applicationsByStage>>;
  className?: string;
}) {
  const total = data.rows.reduce((a, r) => a + r.value, 0);
  return (
    <ChartCard
      className={className}
      title="Applications by stage"
      caption={`${total} in the pipeline · darker = further along`}
      action={<CardLink href="/admin/applications">Board</CardLink>}
      chart={
        <BarList
          ariaLabel="Applications by stage"
          rows={data.rows.map((r, i) => ({
            ...r,
            color: `var(--viz-ord-${i + 1})`,
            detail: `${r.value} ${r.value === 1 ? "application" : "applications"} at ${r.label.toLowerCase()}`,
          }))}
        />
      }
      table={
        <SimpleTable
          head={["Stage", "Applications"]}
          rows={data.rows.map((r) => [r.label, r.value])}
          align={["left", "right"]}
        />
      }
      footer={`Closed: ${data.closed.map((c) => `${c.value} ${c.label.toLowerCase()}`).join(" · ")}`}
    />
  );
}

function SourcesCard({
  data,
  className,
}: {
  data: Awaited<ReturnType<typeof leadSources>>;
  className?: string;
}) {
  return (
    <ChartCard
      className={className}
      title="Where enquiries come from"
      caption="Last 90 days, by website placement"
      action={<CardLink href="/admin/leads/sources">Sources</CardLink>}
      chart={<BarList ariaLabel="Enquiries by source, last 90 days" rows={data} />}
      table={
        <SimpleTable
          head={["Source", "Enquiries", "Detail"]}
          rows={data.map((r) => [r.label, r.value, r.detail ?? ""])}
          align={["left", "right", "left"]}
        />
      }
    />
  );
}

function EnquiriesCard({
  data,
  className,
}: {
  data: Awaited<ReturnType<typeof enquiriesByWeek>>;
  className?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard
      className={className}
      title="New enquiries per week"
      caption={`${total} in the last 12 weeks · weeks start on Monday`}
      action={<CardLink href="/admin/leads">Inbox</CardLink>}
      chart={<ColumnChart data={data} valueKind="count" ariaLabel="New enquiries per week" />}
      table={
        <SimpleTable
          head={["Week", "Enquiries"]}
          rows={data.map((d) => [d.detail, d.value])}
          align={["left", "right"]}
        />
      }
    />
  );
}

function CollectionsCard({
  data,
  className,
}: {
  data: Awaited<ReturnType<typeof monthlyCollections>>;
  className?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard
      className={className}
      title="Collections by month"
      caption={`${formatINR(total, { compact: true })} received in the last 8 months · all receipts, net of refunds`}
      chart={<ColumnChart data={data} valueKind="inr" ariaLabel="Collections by month" />}
      table={
        <SimpleTable
          head={["Month", "Collected"]}
          rows={data.map((d) => [d.detail.split(" · ")[0]!, formatINR(d.value)])}
          align={["left", "right"]}
        />
      }
    />
  );
}

function CollectionRate({
  collection,
  yearName,
}: {
  collection: { due: number; paid: number };
  yearName: string;
}) {
  const ratio = collection.due ? collection.paid / collection.due : 0;
  return (
    <Meter
      label={`Collected of ${yearName} billing`}
      valueText={`${Math.round(ratio * 100)}%`}
      ratio={ratio}
      caption={`${formatINR(collection.paid, { compact: true })} of ${formatINR(collection.due, { compact: true })}, incl. late fees`}
    />
  );
}

function CollectionRateCard(props: { collection: { due: number; paid: number }; yearName: string }) {
  return (
    <section className="rounded-lg border border-line bg-elevated px-5 py-4" aria-label="Collection rate">
      <CollectionRate {...props} />
    </section>
  );
}

function SeatsCard({
  rows,
  intakeName,
  className,
}: {
  rows: Awaited<ReturnType<typeof seatsForIntake>>;
  intakeName: string;
  className?: string;
}) {
  const free = rows.reduce((a, r) => a + r.free, 0);
  const full = rows.filter((r) => r.free === 0).length;
  return (
    <ChartCard
      className={className}
      title={`Places for ${intakeName}`}
      caption={`${free} places free across the school${full ? ` · ${full} ${full === 1 ? "class" : "classes"} full` : ""}`}
      legend={
        <Legend
          items={[
            { label: "Taken (moving up + accepted)", color: "var(--viz-1)" },
            { label: "Offer out", color: "var(--viz-2)" },
            { label: "Free", color: "var(--viz-track)", outline: true },
          ]}
        />
      }
      chart={<SeatMeters rows={rows} ariaLabel={`Places for ${intakeName} by class`} />}
      table={
        <SimpleTable
          head={["Class", "Places", "Moving up", "New, accepted", "Offers out", "Free"]}
          rows={rows.map((r) => [r.label, r.capacity, r.continuing, r.confirmed, r.offered, r.free])}
          align={["left", "right", "right", "right", "right", "right"]}
        />
      }
    />
  );
}

const TONE_ICON = { critical: AlertTriangle, warning: Clock, info: Info } as const;

function TasksCard({ tasks, className }: { tasks: Task[]; className?: string }) {
  const open = tasks.filter((t) => t.count > 0);
  return (
    <section
      className={cn("rounded-lg border border-line bg-elevated", className)}
      aria-labelledby="tasks-title"
    >
      <header className="border-b border-line px-5 py-4">
        <h2 id="tasks-title" className="text-[0.95rem] font-semibold text-fg">
          Today
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {open.length
            ? `${open.length} ${open.length === 1 ? "queue needs" : "queues need"} you`
            : "Nothing waiting on you"}
        </p>
      </header>
      {tasks.length ? (
        <ul className="divide-y divide-line">
          {tasks.map((t) => {
            const Icon = t.count ? TONE_ICON[t.tone] : CheckCircle2;
            return (
              <li key={t.key}>
                <Link
                  href={t.href}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-sunken focus-visible:bg-sunken"
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      !t.count
                        ? "text-muted"
                        : t.tone === "critical"
                          ? "text-danger"
                          : t.tone === "warning"
                            ? "text-warning"
                            : "text-info",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", t.count ? "text-fg" : "text-muted")}>{t.label}</span>
                    {t.detail && <span className="block text-xs text-muted">{t.detail}</span>}
                  </span>
                  <span
                    className={cn("text-sm tabular-nums", t.count ? "font-semibold text-fg" : "text-muted")}
                  >
                    {t.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted">No queues for your role.</p>
      )}
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  OPEN_HOUSE: "Open house",
  CAMPUS_TOUR: "Campus tour",
  SCHOOL_EVENT: "School event",
  ADMISSIONS_TALK: "Admissions talk",
};

function EventsCard({
  events,
  className,
}: {
  events: Awaited<ReturnType<typeof upcomingEvents>>;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-elevated", className)}
      aria-labelledby="events-title"
    >
      <header className="border-b border-line px-5 py-4">
        <h2 id="events-title" className="text-[0.95rem] font-semibold text-fg">
          Coming up
        </h2>
      </header>
      {events.length ? (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3">
              <span className="grid w-11 shrink-0 place-items-center rounded-md border border-line py-1 text-center leading-tight">
                <span className="text-[10px] font-semibold text-muted uppercase">
                  {formatDate(e.startsAt, "MMM")}
                </span>
                <span className="text-base font-semibold text-fg">{formatDate(e.startsAt, "d")}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{e.title}</span>
                <span className="block text-xs text-muted">
                  {KIND_LABEL[e.kind]} · {formatDate(e.startsAt, "EEE, h:mm a")} · {e.location}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden /> Nothing scheduled.
        </p>
      )}
    </section>
  );
}

function UpcomingInstalmentsCard({
  rows,
  className,
}: {
  rows: Awaited<ReturnType<typeof upcomingInstalments>>;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-elevated", className)}
      aria-labelledby="upcoming-title"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="upcoming-title" className="text-[0.95rem] font-semibold text-fg">
            Falling due next
          </h2>
          <p className="mt-0.5 text-xs text-muted">Unpaid instalments due in the next 30 days</p>
        </div>
        <CardLink href="/admin/fees/dues">All dues</CardLink>
      </header>
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <Th>Pupil</Th>
              <Th>Class</Th>
              <Th>Instalment</Th>
              <Th>Due</Th>
              <Th className="text-right">Outstanding</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">
                  {r.invoice.student.firstName} {r.invoice.student.lastName}
                </Td>
                <Td>{r.invoice.student.class.name}</Td>
                <Td className="text-muted">
                  {r.label} · {r.invoice.number}
                </Td>
                <Td className="tabular-nums">{formatDate(r.dueDate)}</Td>
                <Td className="text-right font-medium tabular-nums">{formatINR(r.outstanding)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="px-5 py-6 text-sm text-muted">Nothing falls due in the next 30 days.</p>
      )}
    </section>
  );
}
