import "server-only";
import type { ApplicationStage } from "@prisma/client";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { formatDate, istDateOnly, istDayStart, istMonthStart, istWeekday } from "@/lib/dates";
import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";
import { LEAD_SOURCE_LABEL } from "./leads";
import { PIPELINE, STAGE_LABEL } from "./admissions";

/**
 * Read models for the CRM dashboard. Every function is a plain query over live data (no caches), computed in IST,
 * and returns display-ready values so the charts stay dumb. Callers gate each widget by permission.
 */

export type Delta = { text: string; direction: "up" | "down" | "flat"; good: boolean | null };
export type Kpi = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  delta?: Delta;
  href?: string;
  status?: "critical" | "warning" | "good";
};
export type BarDatum = {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
  href?: string;
};
export type ColumnDatum = { key: string; label: string; value: number; display: string; detail: string };
export type SeatRow = {
  key: string;
  label: string;
  capacity: number;
  continuing: number;
  confirmed: number;
  offered: number;
  free: number;
};
export type Task = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "info";
  detail?: string;
};

const day = 86_400_000;
const OPEN_STAGES: ApplicationStage[] = ["REGISTERED", "DOCUMENTS", "ASSESSMENT", "REVIEW"];

function delta(current: number, previous: number, upIsGood: boolean, unit = "vs previous 7 days"): Delta {
  if (current === previous) return { text: `No change ${unit}`, direction: "flat", good: null };
  const direction = current > previous ? "up" : "down";
  const pct = previous === 0 ? null : Math.round((Math.abs(current - previous) / previous) * 100);
  const size = pct === null ? `${Math.abs(current - previous)}` : `${pct}%`;
  return { text: `${size} ${unit}`, direction, good: direction === "up" ? upIsGood : !upIsGood };
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** The current academic year, and the next one (the admissions intake). */
export async function dashboardYears() {
  const years = await db.academicYear.findMany({ orderBy: { startDate: "asc" } });
  const current = years.find((y) => y.isCurrent) ?? years.at(-1)!;
  const intake = years.find((y) => y.startDate > current.startDate) ?? current;
  return { current, intake };
}

/* ───────────────────────────── Admissions ───────────────────────────── */

export async function admissionsKpis(now: Date, intakeYearId: string): Promise<Kpi[]> {
  const weekStart = istDayStart(now, -6);
  const prevStart = istDayStart(now, -13);
  const live = { mergedIntoId: null };
  const [thisWeek, lastWeek, untouched, tours, open, offers, accepted] = await Promise.all([
    db.lead.count({ where: { ...live, createdAt: { gte: weekStart } } }),
    db.lead.count({ where: { ...live, createdAt: { gte: prevStart, lt: weekStart } } }),
    db.lead.count({ where: { ...live, status: "NEW" } }),
    db.tourBooking.aggregate({
      where: { status: "BOOKED", slot: { startsAt: { gte: now, lt: istDayStart(now, 7) } } },
      _count: true,
      _sum: { visitors: true },
    }),
    db.application.count({ where: { stage: { in: OPEN_STAGES } } }),
    db.application.count({ where: { stage: "OFFER" } }),
    db.application.count({ where: { startYearId: intakeYearId, stage: { in: ["FEE_PAID", "ADMITTED"] } } }),
  ]);
  return [
    {
      key: "enquiries",
      label: "New enquiries, last 7 days",
      value: thisWeek.toLocaleString("en-IN"),
      delta: delta(thisWeek, lastWeek, true),
      sub: untouched
        ? `${plural(untouched, "enquiry", "enquiries")} not yet contacted`
        : "All enquiries contacted",
      href: "/admin/leads?status=NEW",
    },
    {
      key: "tours",
      label: "Tours booked, next 7 days",
      value: tours._count.toLocaleString("en-IN"),
      sub: `${plural(tours._sum.visitors ?? 0, "visitor")} expected`,
      href: "/admin/tours",
    },
    {
      key: "applications",
      label: "Applications in progress",
      value: open.toLocaleString("en-IN"),
      sub: "Registered → panel review",
      href: "/admin/applications",
    },
    {
      key: "offers",
      label: "Offers awaiting acceptance",
      value: offers.toLocaleString("en-IN"),
      sub: `${plural(accepted, "place")} accepted for the intake`,
      href: "/admin/applications/list?stage=OFFER",
    },
  ];
}

/** Applications by pipeline stage (ordinal), plus the closed outcomes as a footnote. */
export async function applicationsByStage() {
  const groups = await db.application.groupBy({
    by: ["stage"],
    _count: true,
    where: { stage: { not: "DRAFT" } },
  });
  const count = (s: ApplicationStage) => groups.find((g) => g.stage === s)?._count ?? 0;
  const rows: BarDatum[] = PIPELINE.map((stage) => ({
    key: stage,
    label: STAGE_LABEL[stage],
    value: count(stage),
    display: count(stage).toLocaleString("en-IN"),
    href: `/admin/applications/list?stage=${stage}`,
  }));
  const closed = (["WAITLISTED", "REJECTED", "WITHDRAWN"] as const).map((s) => ({
    key: s,
    label: STAGE_LABEL[s],
    value: count(s),
  }));
  return { rows, closed };
}

/** Enquiries by website placement over the last `days` days, with how many went on to apply. */
export async function leadSources(now: Date, days = 90): Promise<BarDatum[]> {
  const leads = await db.lead.findMany({
    where: { mergedIntoId: null, createdAt: { gte: istDayStart(now, -(days - 1)) } },
    select: { source: true, status: true },
  });
  const map = new Map<string, { total: number; applied: number }>();
  for (const l of leads) {
    const r = map.get(l.source) ?? { total: 0, applied: 0 };
    r.total++;
    if (l.status === "APPLIED" || l.status === "ADMITTED") r.applied++;
    map.set(l.source, r);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([source, r]) => ({
      key: source,
      label: LEAD_SOURCE_LABEL[source] ?? source,
      value: r.total,
      display: r.total.toLocaleString("en-IN"),
      detail: `${plural(r.total, "enquiry", "enquiries")} · ${r.applied} applied (${Math.round((r.applied / r.total) * 100)}%)`,
      href: `/admin/leads?source=${encodeURIComponent(source)}`,
    }));
}

/** New enquiries per IST week (Monday start) for the last `weeks` weeks; the last bucket is the week so far. */
export async function enquiriesByWeek(now: Date, weeks = 12): Promise<ColumnDatum[]> {
  const thisMonday = istDayStart(now, -(istWeekday(now) - 1));
  const start = new Date(thisMonday.getTime() - (weeks - 1) * 7 * day);
  const leads = await db.lead.findMany({
    where: { mergedIntoId: null, createdAt: { gte: start } },
    select: { createdAt: true },
  });
  const counts = new Array<number>(weeks).fill(0);
  for (const l of leads) {
    const i = Math.floor((l.createdAt.getTime() - start.getTime()) / (7 * day));
    if (i >= 0 && i < weeks) counts[i]!++;
  }
  return counts.map((n, i) => {
    const from = new Date(start.getTime() + i * 7 * day);
    const last = i === weeks - 1;
    return {
      key: from.toISOString(),
      label: formatDate(from, "d MMM"),
      value: n,
      display: n.toLocaleString("en-IN"),
      detail: last
        ? `Week of ${formatDate(from, "d MMM")} · so far`
        : `Week of ${formatDate(from, "d MMM")} – ${formatDate(new Date(from.getTime() + 6 * day), "d MMM")}`,
    };
  });
}

/**
 * Places for the intake year by class: pupils moving up from the class below, places already accepted
 * (offer fee paid or admitted), offers still open, and what is left of the sections' capacity.
 */
export async function seatsForIntake(currentYearId: string, intakeYearId: string): Promise<SeatRow[]> {
  const [classes, sections, onRoll, apps] = await Promise.all([
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.section.groupBy({ by: ["classId"], where: { yearId: intakeYearId }, _sum: { capacity: true } }),
    db.student.findMany({
      where: { status: "ACTIVE", section: { yearId: currentYearId } },
      select: { class: { select: { order: true } } },
    }),
    db.application.groupBy({
      by: ["classId", "stage"],
      where: { startYearId: intakeYearId, stage: { in: ["OFFER", "FEE_PAID", "ADMITTED"] } },
      _count: true,
    }),
  ]);
  const byOrder = new Map<number, number>();
  for (const s of onRoll) byOrder.set(s.class.order, (byOrder.get(s.class.order) ?? 0) + 1);
  return classes.map((c) => {
    const capacity = sections.find((s) => s.classId === c.id)?._sum.capacity ?? 0;
    const continuing = byOrder.get(c.order - 1) ?? 0;
    const appCount = (stages: ApplicationStage[]) =>
      apps.filter((a) => a.classId === c.id && stages.includes(a.stage)).reduce((n, a) => n + a._count, 0);
    const confirmed = appCount(["FEE_PAID", "ADMITTED"]);
    const offered = appCount(["OFFER"]);
    return {
      key: c.id,
      label: c.name,
      capacity,
      continuing,
      confirmed,
      offered,
      free: Math.max(0, capacity - continuing - confirmed - offered),
    };
  });
}

/* ───────────────────────────── Finance ───────────────────────────── */

type OpenInstalment = {
  dueDate: Date;
  outstanding: number;
  studentId: string;
};

async function openInstalments(where: { dueDate: { lt?: Date; gte?: Date } }): Promise<OpenInstalment[]> {
  const rows = await db.instalment.findMany({
    where: {
      ...where,
      status: { notIn: ["PAID", "WAIVED"] },
      invoice: { status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
    },
    select: {
      dueDate: true,
      amountPaise: true,
      lateFeePaise: true,
      lateFeeWaived: true,
      paidPaise: true,
      invoice: { select: { studentId: true } },
    },
  });
  return rows
    .map((r) => ({
      dueDate: r.dueDate,
      outstanding: r.amountPaise + (r.lateFeeWaived ? 0 : r.lateFeePaise) - r.paidPaise,
      studentId: r.invoice.studentId,
    }))
    .filter((r) => r.outstanding > 0);
}

/** Receipts net of refunds, excluding failed attempts. */
async function collected(from: Date, to?: Date): Promise<{ net: number; count: number }> {
  const agg = await db.payment.aggregate({
    where: { status: { not: "FAILED" }, receivedAt: { gte: from, ...(to ? { lt: to } : {}) } },
    _sum: { amountPaise: true, refundedPaise: true },
    _count: true,
  });
  return { net: (agg._sum.amountPaise ?? 0) - (agg._sum.refundedPaise ?? 0), count: agg._count };
}

export async function financeKpis(now: Date, currentYearId: string) {
  const today = istDateOnly(now);
  const [last30, prev30, overdue, upcoming, billed] = await Promise.all([
    collected(istDayStart(now, -29)),
    collected(istDayStart(now, -59), istDayStart(now, -29)),
    openInstalments({ dueDate: { lt: today } }),
    openInstalments({ dueDate: { gte: today, lt: istDateOnly(now, 30) } }),
    db.instalment.findMany({
      where: {
        status: { not: "WAIVED" },
        invoice: { yearId: currentYearId, status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
      },
      select: { amountPaise: true, lateFeePaise: true, lateFeeWaived: true, paidPaise: true },
    }),
  ]);
  const due = billed.reduce((a, i) => a + i.amountPaise + (i.lateFeeWaived ? 0 : i.lateFeePaise), 0);
  const paid = billed.reduce((a, i) => a + i.paidPaise, 0);
  const overdueTotal = overdue.reduce((a, i) => a + i.outstanding, 0);
  const overdueFamilies = new Set(overdue.map((i) => i.studentId)).size;
  const upcomingTotal = upcoming.reduce((a, i) => a + i.outstanding, 0);
  const kpis: Kpi[] = [
    {
      key: "collected",
      label: "Collected, last 30 days",
      value: formatINR(last30.net, { compact: true }),
      delta: delta(last30.net, prev30.net, true, "vs previous 30 days"),
      sub: `${formatINR(Math.round(last30.net / 100) * 100)} from ${plural(last30.count, "receipt")}`,
      href: "/admin/payments",
    },
    {
      key: "overdue",
      label: "Overdue",
      value: formatINR(overdueTotal, { compact: true }),
      sub: `${plural(overdueFamilies, "pupil")} · ${formatINR(Math.round(overdueTotal / 100) * 100)} incl. late fees`,
      status: overdueTotal > 0 ? "critical" : "good",
      href: "/admin/fees/dues?filter=overdue",
    },
    {
      key: "upcoming",
      label: "Falling due, next 30 days",
      value: formatINR(upcomingTotal, { compact: true }),
      sub: `${plural(upcoming.length, "instalment")} · ${formatINR(Math.round(upcomingTotal / 100) * 100)}`,
      href: "/admin/fees/dues",
    },
  ];
  return { kpis, collection: { due, paid } };
}

/** Receipts per IST month for the last `months` months (the last bucket is the month so far). */
export async function monthlyCollections(now: Date, months = 8): Promise<ColumnDatum[]> {
  const start = istMonthStart(now, -(months - 1));
  const payments = await db.payment.findMany({
    where: { status: { not: "FAILED" }, receivedAt: { gte: start } },
    select: { receivedAt: true, amountPaise: true, refundedPaise: true },
  });
  const buckets = Array.from({ length: months }, (_, i) => {
    const from = istMonthStart(now, -(months - 1) + i);
    return { key: formatDate(from, "yyyy-MM"), from, total: 0, n: 0 };
  });
  for (const p of payments) {
    const b = buckets.find((x) => x.key === formatDate(p.receivedAt, "yyyy-MM"));
    if (!b) continue;
    b.total += p.amountPaise - p.refundedPaise;
    b.n++;
  }
  return buckets.map((b, i) => ({
    key: b.key,
    label: formatDate(b.from, "MMM"),
    value: b.total,
    display: formatINR(b.total, { compact: true }),
    detail: `${formatDate(b.from, "MMMM yyyy")}${i === months - 1 ? " · so far" : ""} · ${plural(b.n, "receipt")} · ${formatINR(b.total)}`,
  }));
}

export async function upcomingInstalments(now: Date, limit = 6) {
  const today = istDateOnly(now);
  const rows = await db.instalment.findMany({
    where: {
      dueDate: { gte: today, lt: istDateOnly(now, 30) },
      status: { notIn: ["PAID", "WAIVED"] },
      invoice: { status: { notIn: ["VOID", "WAIVED", "DRAFT"] } },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: 40,
    select: {
      id: true,
      label: true,
      dueDate: true,
      amountPaise: true,
      paidPaise: true,
      invoice: {
        select: {
          id: true,
          number: true,
          student: {
            select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
          },
        },
      },
    },
  });
  return rows
    .map((r) => ({ ...r, outstanding: r.amountPaise - r.paidPaise }))
    .filter((r) => r.outstanding > 0)
    .slice(0, limit);
}

/* ───────────────────────────── Everyone ───────────────────────────── */

/** Today's actionable queues for this person, each only if their role can act on it. */
export async function todaysTasks(user: CurrentUser, now: Date): Promise<Task[]> {
  const endOfToday = istDayStart(now, 1);
  const role = user.role;
  const q: Promise<Task | null>[] = [];
  if (can(role, "leads:read")) {
    // Leadership sees the whole team's follow-ups; everyone else sees their own and unassigned ones.
    const team = role === "PRINCIPAL" || role === "SUPER_ADMIN";
    q.push(
      db.reminder
        .count({
          where: {
            doneAt: null,
            dueAt: { lt: endOfToday },
            ...(team ? {} : { OR: [{ assignedToId: user.id }, { assignedToId: null }] }),
          },
        })
        .then((n) => ({
          key: "reminders",
          label: team ? "Team follow-ups due" : "Follow-ups due",
          count: n,
          href: "/admin/leads/reminders",
          tone: "warning" as const,
        })),
    );
    q.push(
      db.lead
        .count({ where: { mergedIntoId: null, status: "NEW", assignedToId: null } })
        .then((n) => ({
          key: "unassigned",
          label: "Unassigned new enquiries",
          count: n,
          href: "/admin/leads?status=NEW&assignee=none",
          tone: "info" as const,
        })),
    );
  }
  if (can(role, "tours:read"))
    q.push(
      db.tourBooking
        .findMany({
          where: { status: "BOOKED", slot: { startsAt: { gte: istDayStart(now), lt: endOfToday } } },
          select: { slot: { select: { startsAt: true } } },
          orderBy: { slot: { startsAt: "asc" } },
        })
        .then((b) => ({
          key: "tours",
          label: "Tours today",
          count: b.length,
          href: "/admin/tours",
          tone: "info" as const,
          detail: b[0] ? `First at ${formatDate(b[0].slot.startsAt, "h:mm a")}` : undefined,
        })),
    );
  if (can(role, "applications:write"))
    q.push(
      db.applicationDocument
        .count({
          where: { status: "PENDING", fileKey: { not: null }, application: { stage: { in: OPEN_STAGES } } },
        })
        .then((n) => ({
          key: "documents",
          label: "Documents to verify",
          count: n,
          href: "/admin/applications/list?docs=pending",
          tone: "warning" as const,
        })),
    );
  if (can(role, "applications:write"))
    q.push(
      db.application
        .count({ where: { stage: "OFFER", offerExpiresAt: { lt: istDayStart(now, 8) } } })
        .then((n) => ({
          key: "offers",
          label: "Offers expiring within a week",
          count: n,
          href: "/admin/applications/list?stage=OFFER",
          tone: "warning" as const,
        })),
    );
  if (can(role, "fees:waive"))
    q.push(
      db.invoice
        .count({ where: { cancellationFlag: true, status: { notIn: ["VOID", "PAID", "WAIVED"] } } })
        .then((n) => ({
          key: "flagged",
          label: "Invoices flagged for cancellation review",
          count: n,
          href: "/admin/fees/dues?filter=flagged",
          tone: "critical" as const,
        })),
    );
  if (can(role, "concessions:approve"))
    q.push(
      db.studentConcession
        .count({ where: { status: "REQUESTED" } })
        .then((n) => ({
          key: "concessions",
          label: "Concession requests to decide",
          count: n,
          href: "/admin/fees/concessions?status=REQUESTED",
          tone: "warning" as const,
        })),
    );
  if (can(role, "refunds:approve"))
    q.push(
      db.refund
        .count({ where: { status: "REQUESTED" } })
        .then((n) => ({
          key: "refunds",
          label: "Refunds awaiting approval",
          count: n,
          href: "/admin/payments/refunds?status=REQUESTED",
          tone: "warning" as const,
        })),
    );
  if (can(role, "payments:record"))
    q.push(
      db.refund
        .count({ where: { status: "APPROVED" } })
        .then((n) => ({
          key: "refunds-process",
          label: "Approved refunds to process",
          count: n,
          href: "/admin/payments/refunds?status=APPROVED",
          tone: "info" as const,
        })),
    );
  if (can(role, "comms:send"))
    q.push(
      db.outbox
        .count({ where: { status: "FAILED" } })
        .then((n) => ({
          key: "outbox",
          label: "Messages that failed to send",
          count: n,
          href: "/admin/outbox?status=FAILED",
          tone: "critical" as const,
        })),
    );
  const tasks = (await Promise.all(q)).filter((t): t is Task => !!t);
  return tasks;
}

export async function upcomingEvents(now: Date, limit = 4) {
  return db.event.findMany({
    where: { published: true, endsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: limit,
    select: { id: true, title: true, kind: true, location: true, startsAt: true },
  });
}

/** A teacher's lessons for today (or the next school day), from the timetable. */
export async function teachingDay(userId: string, now: Date) {
  const staff = await db.staff.findUnique({ where: { userId }, select: { id: true } });
  if (!staff) return null;
  const weekday = istWeekday(now);
  const schoolDay = weekday <= 5 ? weekday : 1;
  const slots = await db.timetableSlot.findMany({
    where: { teacherId: staff.id, day: schoolDay, section: { year: { isCurrent: true } } },
    orderBy: { period: "asc" },
    select: {
      id: true,
      period: true,
      subject: { select: { name: true } },
      section: { select: { name: true, room: true, class: { select: { name: true } } } },
    },
  });
  return { isToday: weekday <= 5, dayLabel: weekday <= 5 ? "Today" : "Monday", slots };
}

/** Boarding numbers and the lowest pocket-money (imprest) balances among current boarders. */
export async function boardingSnapshot(limit = 5) {
  const [byType, boarders] = await Promise.all([
    db.student.groupBy({ by: ["boardingType"], where: { status: "ACTIVE" }, _count: true }),
    db.student.findMany({
      where: { status: "ACTIVE", boardingType: { in: ["FULL", "FLEXI"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        boardingType: true,
        class: { select: { name: true } },
      },
    }),
  ]);
  const sums = await db.imprestEntry.groupBy({
    by: ["studentId", "kind"],
    where: { studentId: { in: boarders.map((b) => b.id) } },
    _sum: { amountPaise: true },
  });
  const balance = new Map<string, number>();
  for (const s of sums)
    balance.set(
      s.studentId,
      (balance.get(s.studentId) ?? 0) + (s.kind === "CREDIT" ? 1 : -1) * (s._sum.amountPaise ?? 0),
    );
  const low = boarders
    .filter((b) => balance.has(b.id))
    .map((b) => ({ ...b, balance: balance.get(b.id)! }))
    .sort((a, b) => a.balance - b.balance)
    .slice(0, limit);
  const count = (t: string) => byType.find((g) => g.boardingType === t)?._count ?? 0;
  return { full: count("FULL"), flexi: count("FLEXI"), day: count("DAY"), low };
}

export async function registrarKpis(now: Date, currentYearId: string, currentStart: Date): Promise<Kpi[]> {
  const [onRoll, boarders, joined, prospective] = await Promise.all([
    db.student.count({ where: { status: "ACTIVE", section: { yearId: currentYearId } } }),
    db.student.count({
      where: { status: "ACTIVE", section: { yearId: currentYearId }, boardingType: { not: "DAY" } },
    }),
    db.student.count({ where: { status: "ACTIVE", admittedOn: { gte: currentStart } } }),
    db.student.count({ where: { status: "PROSPECTIVE" } }),
  ]);
  return [
    { key: "roll", label: "Pupils on roll", value: onRoll.toLocaleString("en-IN"), href: "/admin/students" },
    {
      key: "boarders",
      label: "Boarders",
      value: boarders.toLocaleString("en-IN"),
      sub: `${Math.round((boarders / Math.max(1, onRoll)) * 100)}% of the roll`,
    },
    {
      key: "joined",
      label: "Joined this year",
      value: joined.toLocaleString("en-IN"),
      sub: `Since ${formatDate(currentStart)}`,
    },
    {
      key: "prospective",
      label: "Places offered, not yet joined",
      value: prospective.toLocaleString("en-IN"),
      href: "/admin/applications/list?stage=FEE_PAID",
    },
  ];
}

export async function hrKpis(now: Date): Promise<Kpi[]> {
  const [open, closingSoon, staff, applications] = await Promise.all([
    db.vacancy.count({ where: { status: "OPEN", closesAt: { gte: now } } }),
    db.vacancy.count({
      where: { status: "OPEN", closesAt: { gte: now, lt: new Date(now.getTime() + 14 * day) } },
    }),
    db.staff.count({ where: { active: true } }),
    db.staffApplication.count({ where: { status: { not: "DRAFT" } } }),
  ]);
  return [
    {
      key: "vacancies",
      label: "Open vacancies",
      value: String(open),
      sub: `${closingSoon} closing within 14 days`,
      href: "/admin/careers/vacancies",
    },
    { key: "applications", label: "Staff applications", value: String(applications), href: "/admin/careers" },
    { key: "staff", label: "Staff in post", value: String(staff), href: "/admin/careers/staff" },
  ];
}
