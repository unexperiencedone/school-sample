import type { Permission } from "@/lib/rbac";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  children?: { label: string; href: string; permission?: Permission }[];
};

/** The 14 CRM modules. Items are filtered by the signed-in role's permissions. */
export const adminNav: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "LayoutDashboard", permission: "dashboard:view" },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: "Inbox",
    permission: "leads:read",
    children: [
      { label: "Inbox", href: "/admin/leads" },
      { label: "Pipeline", href: "/admin/leads/pipeline" },
      { label: "Sources", href: "/admin/leads/sources" },
      { label: "Reminders", href: "/admin/leads/reminders" },
    ],
  },
  { label: "Tours & events", href: "/admin/tours", icon: "CalendarDays", permission: "tours:read" },
  {
    label: "Admissions",
    href: "/admin/applications",
    icon: "GraduationCap",
    permission: "applications:read",
    children: [
      { label: "Pipeline", href: "/admin/applications" },
      { label: "All applications", href: "/admin/applications/list" },
    ],
  },
  {
    label: "Academics",
    href: "/admin/academics",
    icon: "School",
    permission: "academics:read",
    children: [
      { label: "Classes & sections", href: "/admin/academics" },
      { label: "Years & terms", href: "/admin/academics/years" },
      { label: "Subjects", href: "/admin/academics/subjects" },
      { label: "Timetable", href: "/admin/academics/timetable" },
    ],
  },
  {
    label: "Students",
    href: "/admin/students",
    icon: "Users",
    permission: "students:read",
    children: [
      { label: "Directory", href: "/admin/students" },
      { label: "Promotion", href: "/admin/students/promotion", permission: "students:promote" },
      { label: "Requests", href: "/admin/students/requests" },
    ],
  },
  {
    label: "Fees",
    href: "/admin/fees",
    icon: "ReceiptIndianRupee",
    permission: "fees:read",
    children: [
      { label: "Structures", href: "/admin/fees" },
      { label: "Fee heads", href: "/admin/fees/heads" },
      { label: "Plans & rules", href: "/admin/fees/rules" },
      { label: "Concessions", href: "/admin/fees/concessions" },
      { label: "Invoices", href: "/admin/fees/invoices" },
      { label: "Dues", href: "/admin/fees/dues" },
    ],
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: "CreditCard",
    permission: "payments:read",
    children: [
      { label: "Payments", href: "/admin/payments" },
      { label: "Orders", href: "/admin/payments/orders" },
      { label: "Refunds", href: "/admin/payments/refunds" },
      { label: "Reconciliation", href: "/admin/payments/reconciliation", permission: "reconciliation:run" },
      { label: "Webhook log", href: "/admin/payments/webhooks" },
    ],
  },
  { label: "Imprest", href: "/admin/imprest", icon: "Wallet", permission: "imprest:read" },
  {
    label: "Careers",
    href: "/admin/careers",
    icon: "BriefcaseBusiness",
    permission: "careers:read",
    children: [
      { label: "Applications", href: "/admin/careers" },
      { label: "Vacancies", href: "/admin/careers/vacancies" },
      { label: "Staff directory", href: "/admin/careers/staff" },
    ],
  },
  {
    label: "Communication",
    href: "/admin/comms",
    icon: "Megaphone",
    permission: "comms:read",
    children: [
      { label: "Circulars", href: "/admin/comms" },
      { label: "Templates", href: "/admin/comms/templates" },
      { label: "Outbox", href: "/admin/outbox" },
    ],
  },
  {
    label: "Content",
    href: "/admin/content",
    icon: "PenLine",
    permission: "content:write",
    children: [
      { label: "Announcement bar", href: "/admin/content" },
      { label: "Events & modal", href: "/admin/content/events" },
      { label: "Blog drafts", href: "/admin/content/blog" },
    ],
  },
  { label: "Reports", href: "/admin/reports", icon: "ChartColumn", permission: "reports:read" },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "Settings",
    permission: "settings:read",
    children: [
      { label: "School", href: "/admin/settings" },
      { label: "Integrations", href: "/admin/settings/integrations" },
      { label: "Users & roles", href: "/admin/settings/users", permission: "users:manage" },
      { label: "Audit log", href: "/admin/settings/audit", permission: "audit:read" },
      { label: "Privacy requests", href: "/admin/settings/privacy", permission: "privacy:manage" },
    ],
  },
];
