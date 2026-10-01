import type { Role } from "@prisma/client";

/** Fixed demo accounts created by the seed. Only usable when NEXT_PUBLIC_DEMO_MODE=true. */
export const DEMO_USERS: { role: Role; email: string; label: string; blurb: string }[] = [
  {
    role: "PRINCIPAL",
    email: "principal@aurelia-sample.test",
    label: "Principal",
    blurb: "Whole-school view, approvals, reports",
  },
  {
    role: "ADMISSIONS",
    email: "admissions@aurelia-sample.test",
    label: "Admissions",
    blurb: "Leads, tours, applications",
  },
  {
    role: "ACCOUNTS",
    email: "accounts@aurelia-sample.test",
    label: "Accounts",
    blurb: "Fees, payments, refunds, reconciliation",
  },
  {
    role: "TEACHER",
    email: "teacher@aurelia-sample.test",
    label: "Teacher",
    blurb: "Class lists and timetable",
  },
  {
    role: "PARENT",
    email: "parent@aurelia-sample.test",
    label: "Parent",
    blurb: "Two children, dues, receipts, imprest",
  },
  {
    role: "APPLICANT",
    email: "applicant@aurelia-sample.test",
    label: "Applicant",
    blurb: "Track a registration",
  },
  {
    role: "SUPER_ADMIN",
    email: "admin@aurelia-sample.test",
    label: "Super admin",
    blurb: "Settings, users, audit, demo reset",
  },
  {
    role: "REGISTRAR",
    email: "registrar@aurelia-sample.test",
    label: "Registrar",
    blurb: "Students, classes, promotion",
  },
  { role: "HR", email: "hr@aurelia-sample.test", label: "HR", blurb: "Vacancies and staff applications" },
  {
    role: "HOUSEPARENT",
    email: "houseparent@aurelia-sample.test",
    label: "Houseparent",
    blurb: "Boarders, medical notes, imprest",
  },
];

export const DEMO_PASSWORD = "aurelia-demo"; // seed-only; never rendered in the UI
