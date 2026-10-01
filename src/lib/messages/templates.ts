import { school, siteUrl } from "@/config/school";
import type { SchoolEmailProps } from "@/emails/school-email";

/**
 * Transactional templates. Each renders an email (React Email layout), and optionally a WhatsApp
 * template (name + ordered variables, as approved with the provider) and a DLT SMS template.
 */
export type TemplateKey =
  | "enquiry-received"
  | "tour-confirmation"
  | "tour-reminder"
  | "registration-receipt"
  | "application-status"
  | "offer-letter"
  | "fee-invoice"
  | "payment-receipt"
  | "overdue-reminder"
  | "refund-update"
  | "staff-application-received"
  | "staff-application-resume"
  | "magic-link"
  | "circular"
  | "test-message";

type Data = Record<string, string | number | undefined>;

export type RenderedTemplate = {
  subject: string;
  email: SchoolEmailProps;
  whatsapp?: { template: string; variables: string[] };
  sms?: { templateId: string; text: string; variables: Record<string, string> };
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export const TEMPLATES: Record<TemplateKey, { name: string; render: (d: Data) => RenderedTemplate }> = {
  "enquiry-received": {
    name: "Enquiry received",
    render: (d) => ({
      subject: `Thank you for your enquiry, ${s(d.parentName)}`,
      email: {
        preview: "We have received your enquiry and will be in touch within one working day.",
        heading: "Thank you for getting in touch",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `Thank you for your interest in ${school.name}. A member of our admissions team will call you within one working day to understand what you are looking for and answer your questions.`,
          "In the meantime, you are warmly invited to visit the campus.",
        ],
        facts: [
          ["Reference", s(d.ref)],
          ["Class of interest", s(d.classApplying)],
        ],
        cta: { label: "Book a campus tour", href: `${siteUrl()}/book-a-tour` },
      },
      whatsapp: { template: "enquiry_received_v1", variables: [s(d.parentName), school.name] },
      sms: {
        templateId: "DLT-ENQ-0001",
        text: `Thank you for your enquiry with ${school.shortName}. Our admissions team will call you shortly. Ref ${s(d.ref)}`,
        variables: { var1: s(d.ref) },
      },
    }),
  },
  "tour-confirmation": {
    name: "Tour confirmation",
    render: (d) => ({
      subject: `Your campus visit on ${s(d.date)} is confirmed`,
      email: {
        preview: `See you on ${s(d.date)} at ${s(d.time)}.`,
        heading: "Your campus visit is confirmed",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          "We look forward to welcoming you. Please arrive ten minutes early and bring photo ID for the gate.",
        ],
        facts: [
          ["Date", s(d.date)],
          ["Time", s(d.time)],
          ["Visitors", s(d.visitors)],
          ["Meeting point", "Main reception, North Arch"],
        ],
      },
      whatsapp: { template: "tour_confirmed_v1", variables: [s(d.parentName), s(d.date), s(d.time)] },
      sms: {
        templateId: "DLT-TOUR-0001",
        text: `${school.shortName}: campus visit confirmed for ${s(d.date)} ${s(d.time)}.`,
        variables: { var1: s(d.date), var2: s(d.time) },
      },
    }),
  },
  "tour-reminder": {
    name: "Tour reminder",
    render: (d) => ({
      subject: `Reminder: your campus visit tomorrow at ${s(d.time)}`,
      email: {
        preview: "A gentle reminder about your visit tomorrow.",
        heading: "See you tomorrow",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `This is a reminder of your campus visit on ${s(d.date)} at ${s(d.time)}.`,
        ],
      },
      whatsapp: { template: "tour_reminder_v1", variables: [s(d.parentName), s(d.date), s(d.time)] },
    }),
  },
  "registration-receipt": {
    name: "Registration receipt",
    render: (d) => ({
      subject: `Registration received for ${s(d.childName)} (${s(d.ref)})`,
      email: {
        preview: "Your registration and fee payment have been received.",
        heading: "Registration complete",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `We have received the registration for ${s(d.childName)} and the registration fee. You can follow every step of the application from your applicant dashboard.`,
        ],
        facts: [
          ["Application", s(d.ref)],
          ["Amount paid", s(d.amount)],
          ["Receipt", s(d.receipt)],
        ],
        cta: {
          label: "Track your application",
          href: `${siteUrl()}/login?email=${encodeURIComponent(s(d.email))}`,
        },
      },
      whatsapp: {
        template: "registration_received_v1",
        variables: [s(d.parentName), s(d.childName), s(d.ref)],
      },
    }),
  },
  "application-status": {
    name: "Application status change",
    render: (d) => ({
      subject: `Application ${s(d.ref)}: ${s(d.stageLabel)}`,
      email: {
        preview: `Your application is now at: ${s(d.stageLabel)}.`,
        heading: `Application update: ${s(d.stageLabel)}`,
        paragraphs: [`Dear ${s(d.parentName)},`, s(d.message) || "There is an update on your application."],
        cta: { label: "View application", href: `${siteUrl()}/applicant` },
      },
      whatsapp: {
        template: "application_update_v1",
        variables: [s(d.parentName), s(d.ref), s(d.stageLabel)],
      },
    }),
  },
  "offer-letter": {
    name: "Offer letter",
    render: (d) => ({
      subject: `An offer of a place for ${s(d.childName)}`,
      email: {
        preview: "We are delighted to offer a place.",
        heading: "We are delighted to offer a place",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `Following the assessment and review, we are delighted to offer ${s(d.childName)} a place in ${s(d.className)} (${s(d.boarding)}) from ${s(d.session)}.`,
          `To confirm the place, please complete the admission fee payment by ${s(d.acceptBy)}. The offer letter is attached in your applicant dashboard.`,
        ],
        cta: { label: "Accept and pay", href: `${siteUrl()}/applicant` },
      },
    }),
  },
  "fee-invoice": {
    name: "Fee invoice",
    render: (d) => ({
      subject: `Fee invoice ${s(d.number)} for ${s(d.studentName)}`,
      email: {
        preview: `Invoice ${s(d.number)}: ${s(d.total)}.`,
        heading: "Your fee invoice",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `The ${s(d.year)} fee invoice for ${s(d.studentName)} is ready.`,
        ],
        facts: [
          ["Invoice", s(d.number)],
          ["Total", s(d.total)],
          ["First due", s(d.firstDue)],
        ],
        cta: { label: "View and pay", href: `${siteUrl()}/portal/fees` },
      },
    }),
  },
  "payment-receipt": {
    name: "Payment receipt",
    render: (d) => ({
      subject: `Payment received — receipt ${s(d.receipt)}`,
      email: {
        preview: `We received ${s(d.amount)}. Thank you.`,
        heading: "Payment received",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `Thank you. We have received your payment of ${s(d.amount)}.`,
        ],
        facts: [
          ["Receipt", s(d.receipt)],
          ["Student", s(d.studentName)],
          ["Method", s(d.method)],
          ["Date", s(d.date)],
        ],
        cta: { label: "Download receipt", href: `${siteUrl()}/portal/payments` },
      },
      whatsapp: { template: "payment_received_v1", variables: [s(d.amount), s(d.receipt)] },
      sms: {
        templateId: "DLT-PAY-0001",
        text: `${school.shortName}: payment of ${s(d.amount)} received. Receipt ${s(d.receipt)}.`,
        variables: { var1: s(d.amount), var2: s(d.receipt) },
      },
    }),
  },
  "overdue-reminder": {
    name: "Overdue reminder",
    render: (d) => ({
      subject: `Fee reminder: ${s(d.amount)} overdue for ${s(d.studentName)}`,
      email: {
        preview: `${s(d.amount)} was due on ${s(d.dueDate)}.`,
        heading: "A gentle fee reminder",
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `Our records show ${s(d.amount)} for ${s(d.studentName)} (${s(d.label)}) was due on ${s(d.dueDate)}. A late fee applies as per the fee policy. If you have already paid, please ignore this message.`,
        ],
        cta: { label: "Pay now", href: `${siteUrl()}/portal/fees` },
      },
      whatsapp: { template: "fee_overdue_v1", variables: [s(d.studentName), s(d.amount), s(d.dueDate)] },
      sms: {
        templateId: "DLT-DUE-0001",
        text: `${school.shortName}: ${s(d.amount)} overdue since ${s(d.dueDate)} for ${s(d.studentName)}.`,
        variables: { var1: s(d.amount), var2: s(d.dueDate) },
      },
    }),
  },
  "refund-update": {
    name: "Refund update",
    render: (d) => ({
      subject: `Refund ${s(d.status)}: ${s(d.amount)}`,
      email: {
        preview: `Your refund is ${s(d.status)}.`,
        heading: `Refund ${s(d.status)}`,
        paragraphs: [
          `Dear ${s(d.parentName)},`,
          `Your refund of ${s(d.amount)} is now ${s(d.status)}. ${s(d.note)}`,
        ],
      },
    }),
  },
  "staff-application-received": {
    name: "Staff application received",
    render: (d) => ({
      subject: `Application received: ${s(d.role)} (${s(d.ref)})`,
      email: {
        preview: "Thank you for applying.",
        heading: "Thank you for applying",
        paragraphs: [
          `Dear ${s(d.name)},`,
          `We have received your application for ${s(d.role)}. Our HR team reviews every application and will contact shortlisted candidates.`,
        ],
        facts: [["Reference", s(d.ref)]],
      },
    }),
  },
  "staff-application-resume": {
    name: "Resume staff application",
    render: (d) => ({
      subject: "Continue your application",
      email: {
        preview: "Your draft has been saved.",
        heading: "Your draft is saved",
        paragraphs: [
          "Use the link below to continue your application where you left off. The link expires in 14 days.",
        ],
        cta: { label: "Continue application", href: s(d.url) },
      },
    }),
  },
  "magic-link": {
    name: "Sign-in link",
    render: (d) => ({
      subject: `Sign in to ${school.shortName}`,
      email: {
        preview: "Your secure sign-in link (valid for 30 minutes).",
        heading: "Your sign-in link",
        paragraphs: [
          "Click the button below to sign in. The link works once and expires in 30 minutes. If you did not ask for it, you can ignore this email.",
        ],
        cta: { label: "Sign in", href: s(d.url) },
      },
    }),
  },
  circular: {
    name: "Circular",
    render: (d) => ({
      subject: s(d.title),
      email: {
        preview: s(d.title),
        heading: s(d.title),
        paragraphs: s(d.body).split(/\n{2,}/),
        cta: { label: "Open parent portal", href: `${siteUrl()}/portal/circulars` },
      },
      whatsapp: { template: "circular_v1", variables: [s(d.title)] },
    }),
  },
  "test-message": {
    name: "Integration test",
    render: () => ({
      subject: "Integration test",
      email: {
        preview: "Test message",
        heading: "Integration test",
        paragraphs: ["If you can read this, the adapter is wired correctly."],
      },
      whatsapp: { template: "test_v1", variables: ["test"] },
      sms: { templateId: "DLT-TEST-0001", text: "Integration test", variables: {} },
    }),
  },
};
