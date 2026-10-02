import type { Role } from "@prisma/client";

/** The ten moments worth showing, in the order that tells the story. Used by /demo and mirrored in docs/DEMO_SCRIPT.md. */
export type Moment = {
  n: number;
  title: string;
  /** Who is signed in for this moment; null = the public website. */
  role: Role | null;
  roleLabel: string;
  /** Where "Start" goes (after signing in as `role`, when there is one). */
  start: string;
  /** Optional second link: the other side of the story. */
  then?: { label: string; role: Role | null; to: string };
  say: string;
  steps: string[];
};

export const MOMENTS: Moment[] = [
  {
    n: 1,
    title: "An enquiry lands in the CRM, live",
    role: null,
    roleLabel: "Visitor, then Admissions",
    start: "/contact",
    then: { label: "Open the lead inbox", role: "ADMISSIONS", to: "/admin/leads" },
    say: "A parent's question never sits in a shared inbox. It arrives tagged with its source, assigned and timestamped, and the first reply is minutes away, not days.",
    steps: [
      "Submit the enquiry form (any placeholder details; the captcha is a self-hosted image).",
      "Open the lead inbox as Admissions: the new lead is at the top, with its source.",
      "Open it: the activity timeline shows the confirmation email already sent (Outbox).",
    ],
  },
  {
    n: 2,
    title: "Book a campus tour",
    role: null,
    roleLabel: "Visitor, then Admissions",
    start: "/book-a-tour",
    then: { label: "Open tours and check-in", role: "ADMISSIONS", to: "/admin/tours" },
    say: "Slots have real capacity, so a Saturday can't be overbooked. The family gets a confirmation and a reminder the day before.",
    steps: [
      "Pick a slot and book for two visitors.",
      "As Admissions open Tours: the booking is on that slot's list.",
      "Check the family in on the day; the lead moves to Tour done.",
    ],
  },
  {
    n: 3,
    title: "Register and pay on the mock gateway",
    role: null,
    roleLabel: "Visitor",
    start: "/admissions/register",
    say: "Registration ends in a payment through the same code path as production. Switching to Razorpay is one environment variable.",
    steps: [
      "Walk the five steps (child, parents, boarding, documents, review).",
      "Pay the registration fee: on the fake gateway press Succeed (try Duplicate webhook too: still one receipt).",
      "You land on a receipt and a sign-in link to track the application.",
    ],
  },
  {
    n: 4,
    title: "Revise a fee structure and review the diff",
    role: "ACCOUNTS",
    roleLabel: "Accounts",
    start: "/admin/fees/structures",
    say: "Fees are versioned. Before anything changes you see exactly what a 5% revision does to every open invoice, family by family.",
    steps: [
      "Open a structure and press Revise; apply +5% to recurring heads.",
      "Read the impact preview: head-by-head diff, invoices affected, change still to collect, credits created.",
      "Publish with reprice on: families get a revised invoice by email; paid instalments stay untouched.",
    ],
  },
  {
    n: 5,
    title: "Pay an instalment as a parent",
    role: "PARENT",
    roleLabel: "Parent",
    start: "/portal",
    say: "One login, two daughters. The parent sees what is due, pays in two taps and the receipt is there before they put the phone down.",
    steps: [
      "Switch to Anvi (second instalment due).",
      "Pay on the mock gateway; return to the fees page.",
      "Open the receipt PDF: gap-free number, the allocation, any credit on account.",
    ],
  },
  {
    n: 6,
    title: "A refund needs two people",
    role: "ACCOUNTS",
    roleLabel: "Accounts, then Principal",
    start: "/admin/payments/refunds/new",
    then: { label: "Approve as Principal", role: "PRINCIPAL", to: "/admin/payments/refunds" },
    say: "The person who asks can never be the person who approves. The policy quote does the arithmetic; the audit log keeps the story.",
    steps: [
      "As Accounts pick a pupil's payment and take the policy quote for a withdrawal.",
      "Request the refund. Try approving it as the same user: refused.",
      "As Principal approve; as Accounts pay out. The family is notified.",
    ],
  },
  {
    n: 7,
    title: "Reports and exports",
    role: "ACCOUNTS",
    roleLabel: "Accounts",
    start: "/admin/reports",
    say: "The numbers a bursar and a principal ask for every month, one click each, with the table behind every chart and an Excel file for the board pack.",
    steps: [
      "Open Collections: month by month, by class, by head.",
      "Open Outstanding: ageing buckets and the top families by balance.",
      "Export to XLSX: real numbers, not text; every export is audited.",
    ],
  },
  {
    n: 8,
    title: "Import a bank statement and reconcile",
    role: "ACCOUNTS",
    roleLabel: "Accounts",
    start: "/admin/payments/reconciliation",
    say: "Month-end reconciliation drops from an afternoon to a few clicks, and nothing is guessed: ambiguous lines wait for a person.",
    steps: [
      "Press 'Download sample statement' then import that file.",
      "Watch lines auto-match by reference, then by unique amount and date.",
      "Set the stray credit aside as 'not a fee'.",
    ],
  },
  {
    n: 9,
    title: "Year-end promotion, and a locked medical record",
    role: "REGISTRAR",
    roleLabel: "Registrar",
    start: "/admin/students/promotion",
    say: "Promoting 240 girls is a preview and one confirmation. And the most sensitive data in the school is behind its own door, with every look recorded.",
    steps: [
      "Read the preview: who moves where, over-capacity sections, Year 13 leavers.",
      "Tick Repeat for one pupil to see how retention is handled (don't confirm unless you want to).",
      "Open a pupil's medical record: the access notice, then the audit log entry.",
    ],
  },
  {
    n: 10,
    title: "From a staff application to a hire",
    role: null,
    roleLabel: "Applicant, then HR",
    start: "/careers/apply",
    then: { label: "Open the hiring pipeline", role: "HR", to: "/admin/careers" },
    say: "Nine steps, autosaved and resumable by email, with the safer-recruitment questions built in. HR sees a clean, scored, printable file.",
    steps: [
      "Start an application and leave: use the emailed link (Outbox in dev) to resume it.",
      "As HR open the pipeline, shortlist a candidate, score and add a note.",
      "Download the application PDF; move a candidate to Hired and add them to the staff directory.",
    ],
  },
];
