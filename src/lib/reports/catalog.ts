export const REPORT_SLUGS = ["collections", "outstanding", "funnel", "sources", "seats"] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export const REPORT_META: Record<
  ReportSlug,
  {
    title: string;
    description: string;
    /** Whether the date range filter means something for this report. */
    dateRange: boolean;
  }
> = {
  collections: {
    title: "Fee collections",
    description: "What was received, by month, class, fee head and payment method, against what was billed.",
    dateRange: true,
  },
  outstanding: {
    title: "Outstanding fees",
    description: "Unpaid principal and late fees by class and age, and the families owing the most.",
    dateRange: true,
  },
  funnel: {
    title: "Admissions funnel",
    description:
      "How enquiries become tours, applications, offers and admissions, and how long each stage takes.",
    dateRange: true,
  },
  sources: {
    title: "Lead sources",
    description: "Which website placements and campaigns bring families who go on to apply and join.",
    dateRange: true,
  },
  seats: {
    title: "Seat utilisation",
    description:
      "Capacity against pupils, open offers and the waitlist for every class, with over-capacity flagged.",
    dateRange: false,
  },
};

export const isReportSlug = (s: string): s is ReportSlug => (REPORT_SLUGS as readonly string[]).includes(s);
