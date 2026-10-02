import { createElement } from "react";
import { render } from "@react-email/render";
import { requireStaff } from "@/lib/auth/session";
import { TEMPLATES, type TemplateKey } from "@/lib/messages/templates";
import { SchoolEmail } from "@/emails/school-email";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Message templates" };

const SAMPLE: Record<string, string> = {
  parentName: "Kavita Menon",
  childName: "Ira Menon",
  studentName: "Ira Menon",
  ref: "ENQ-26ABC123",
  classApplying: "Year 7",
  className: "Year 7",
  date: "Saturday 24 October",
  time: "9:30 AM",
  visitors: "2",
  amount: "₹1,57,380",
  receipt: "AHR/2026-27/000123",
  number: "AHI/2026-27/00042",
  total: "₹9,48,500",
  firstDue: "₹3,79,400 on 10 Apr 2027",
  year: "2026-27",
  method: "UPI",
  dueDate: "10 October 2026",
  label: "Second instalment",
  stageLabel: "Assessment",
  message: "We look forward to meeting Ira.",
  boarding: "full boarding",
  session: "2027-28",
  acceptBy: "15 October 2026",
  status: "processed",
  note: "It should reach your account within 5–7 working days.",
  title: "Half-term arrangements",
  body: "Dear parents,\n\nHalf term begins on Friday 23 October at 1 pm.",
  url: "https://example.test/sign-in",
  vacancyTitle: "Teacher of Mathematics",
  resumeUrl: "https://example.test/careers/apply/resume",
};

/** Every transactional message, as families will see it on each channel. Edits are made in code and reviewed. */
export default async function Templates() {
  await requireStaff("comms:read");
  const rows = await Promise.all(
    (Object.keys(TEMPLATES) as TemplateKey[]).map(async (key) => {
      const r = TEMPLATES[key].render(SAMPLE);
      return { key, name: TEMPLATES[key].name, r, html: await render(createElement(SchoolEmail, r.email)) };
    }),
  );
  return (
    <>
      <PageHeader
        title="Message templates"
        description="Each message has an email version and, where it matters, an approved WhatsApp template and a DLT-registered SMS. Shown here with sample data."
      />
      <div className="space-y-3">
        {rows.map(({ key, name, r, html }) => (
          <details key={key} className="rounded-lg border border-line bg-elevated">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span>
                <span className="font-medium">{name}</span>
                <span className="block text-sm text-muted">{r.subject}</span>
              </span>
              <span className="flex gap-1">
                <Badge tone="info">email</Badge>
                {r.whatsapp && <Badge tone="success">WhatsApp</Badge>}
                {r.sms && <Badge tone="accent">SMS</Badge>}
              </span>
            </summary>
            <div className="grid gap-4 border-t border-line p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <iframe
                title={`${name} email preview`}
                srcDoc={html}
                sandbox=""
                className="h-[28rem] w-full rounded-md border border-line bg-white"
              />
              <div className="space-y-4 text-sm">
                {r.whatsapp && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">WhatsApp template</p>
                    <p className="mt-1 font-mono text-xs">{r.whatsapp.template}</p>
                    <ol className="mt-1 list-decimal pl-5">
                      {r.whatsapp.variables.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {r.sms && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase">SMS · DLT {r.sms.templateId}</p>
                    <p className="mt-1 rounded-md bg-sunken p-2">{r.sms.text}</p>
                    <p className="mt-1 text-xs text-muted">{r.sms.text.length} characters</p>
                  </div>
                )}
                <p className="text-xs text-muted">Key: {key}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
