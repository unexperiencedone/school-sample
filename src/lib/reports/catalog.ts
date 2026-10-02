import type { Role } from "@prisma/client";
import { can, type Permission } from "@/lib/rbac";

export const REPORT_SLUGS = ["collections", "outstanding", "funnel", "sources", "seats"] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export const REPORT_META: Record<
  ReportSlug,
  {
    title: string;
    description: string;
    /** Whether the date range filter means something for this report. */
    dateRange: boolean;
    /** What the data underneath needs, on top of `reports:read` (view) or `reports:export` (download). */
    permission: Permission;
  }
> = {
  collections: {
    title: "Fee collections",
    description: "What was received, by month, class, fee head and payment method, against what was billed.",
    dateRange: true,
    permission: "payments:read",
  },
  outstanding: {
    title: "Outstanding fees",
    description: "Unpaid principal and late fees by class and age, and the families owing the most.",
    dateRange: true,
    permission: "fees:read",
  },
  funnel: {
    title: "Admissions funnel",
    description:
      "How enquiries become tours, applications, offers and admissions, and how long each stage takes.",
    dateRange: true,
    permission: "applications:read",
  },
  sources: {
    title: "Lead sources",
    description: "Which website placements and campaigns bring families who go on to apply and join.",
    dateRange: true,
    permission: "leads:read",
  },
  seats: {
    title: "Seat utilisation",
    description:
      "Capacity against pupils, open offers and the waitlist for every class, with over-capacity flagged.",
    dateRange: false,
    permission: "academics:read",
  },
};

/** Whether a role may view a report: `reports:read` plus the permission its data needs. */
export const canOpenReport = (role: Role | null | undefined, slug: ReportSlug): boolean =>
  can(role, "reports:read") && can(role, REPORT_META[slug].permission);

/** The reports a role may open, in catalogue order. */
export const reportsFor = (role: Role | null | undefined): ReportSlug[] =>
  REPORT_SLUGS.filter((slug) => canOpenReport(role, slug));

export const isReportSlug = (s: string): s is ReportSlug => (REPORT_SLUGS as readonly string[]).includes(s);
