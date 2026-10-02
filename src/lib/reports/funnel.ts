import type { ApplicationStage, Prisma } from "@prisma/client";
import { ratioBp } from "./table";

/**
 * The admissions funnel is counted per enquiry ("lead"), and a lead counts at every step it has reached or passed:
 * a family that went straight to registering without a tour still counts as having reached "tour booked".
 * That keeps the funnel monotone, so a conversion can never exceed 100%.
 */
export const FUNNEL_STEPS = [
  { key: "enquiries", label: "Enquiries" },
  { key: "tourBooked", label: "Tours booked" },
  { key: "tourDone", label: "Tours done" },
  { key: "applied", label: "Applications" },
  { key: "offered", label: "Offers" },
  { key: "admitted", label: "Admitted" },
] as const;

export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"];
/** Index into FUNNEL_STEPS; 0 is every enquiry. */
export type FunnelLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** What proves a lead has reached each step. Later steps imply every earlier one. */
const SIGNALS: Record<Exclude<FunnelLevel, 0>, Prisma.LeadWhereInput[]> = {
  1: [{ status: "TOUR_BOOKED" }, { bookings: { some: { status: { not: "CANCELLED" } } } }],
  2: [{ status: "TOUR_DONE" }, { bookings: { some: { status: "CHECKED_IN" } } }],
  3: [{ status: "APPLIED" }, { applications: { some: { stage: { not: "DRAFT" } } } }],
  4: [
    {
      applications: {
        some: {
          OR: [{ stage: { in: ["OFFER", "FEE_PAID", "ADMITTED"] } }, { offerIssuedAt: { not: null } }],
        },
      },
    },
  ],
  5: [{ status: "ADMITTED" }, { applications: { some: { stage: { in: ["FEE_PAID", "ADMITTED"] } } } }],
};

/** Prisma filter for "has reached funnel step `level` or any later one". Level 0 matches every lead. */
export function reachedWhere(level: FunnelLevel): Prisma.LeadWhereInput {
  if (level === 0) return {};
  const proofs: Prisma.LeadWhereInput[] = [];
  for (let l = level; l <= 5; l++) proofs.push(...SIGNALS[l as Exclude<FunnelLevel, 0>]);
  return { OR: proofs };
}

export type FunnelRow = {
  key: FunnelKey;
  label: string;
  count: number;
  /** Share of the previous step, in basis points (null for the first step or an empty previous step). */
  stepBp: number | null;
  /** Share of all enquiries, in basis points. */
  overallBp: number | null;
};

/** Turns six counts (enquiries first) into rows with step and overall conversion; counts are forced monotone. */
export function funnelRows(counts: number[]): FunnelRow[] {
  const top = counts[0] ?? 0;
  let previous = top;
  return FUNNEL_STEPS.map((step, i) => {
    const count = i === 0 ? top : Math.min(counts[i] ?? 0, previous);
    const row: FunnelRow = {
      key: step.key,
      label: step.label,
      count,
      stepBp: i === 0 ? null : ratioBp(count, previous),
      overallBp: ratioBp(count, top),
    };
    previous = count;
    return row;
  });
}

/* ───────────── time in stage ───────────── */

export type StageEvent = { applicationId: string; toStage: ApplicationStage; createdAt: Date };

const DAY_MS = 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Days each application spent in each stage it has since left: the gap between entering a stage and the next
 * stage-change event. A stage an application is still in has no duration yet and is left out.
 */
export function stageDurations(events: StageEvent[]): Map<ApplicationStage, number[]> {
  const byApplication = new Map<string, StageEvent[]>();
  for (const e of events) {
    const list = byApplication.get(e.applicationId);
    if (list) list.push(e);
    else byApplication.set(e.applicationId, [e]);
  }
  const out = new Map<ApplicationStage, number[]>();
  for (const list of byApplication.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < list.length - 1; i++) {
      const days = (list[i + 1]!.createdAt.getTime() - list[i]!.createdAt.getTime()) / DAY_MS;
      const stage = list[i]!.toStage;
      const bucket = out.get(stage);
      if (bucket) bucket.push(days);
      else out.set(stage, [days]);
    }
  }
  return out;
}

/** One decimal place, for tables ("3.5 days"). */
export const roundDays = (days: number) => Math.round(days * 10) / 10;
