import Link from "next/link";
import { CalendarDays, FileText, IndianRupee } from "lucide-react";
import { AdmissionsJourney, type JourneyStep } from "@/components/site/admissions-journey";
import { PageHero, SectionHeader } from "@/components/site/blocks";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { JsonLd } from "@/components/site/json-ld";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { pageMetadata } from "@/lib/seo/metadata";
import { formatINR } from "@/lib/money";
import { school } from "@/config/school";

export const metadata = pageMetadata({
  title: "Admissions",
  description: "How to join Aurelia Hall: six clear steps from first enquiry to first day.",
  path: "/admissions",
  image: "/images/admissions.webp",
});

const STEPS: JourneyStep[] = [
  {
    title: "Enquiry & counselling",
    when: "Any time",
    text: "Tell us about your daughter. An admissions counsellor will call within one working day and invite you to visit.",
    details: [
      "Enquire online, by phone or WhatsApp",
      "Open Mornings each term, private tours on weekdays",
      "A conversation about what your daughter needs, not a sales pitch",
    ],
  },
  {
    title: "Registration",
    when: "About 10 minutes online",
    text: "Complete the online registration form, upload documents and pay the non-refundable registration fee.",
    details: [
      `Registration fee ${formatINR(school.registrationFeePaise)} (sample)`,
      "Birth certificate, latest report, photo and ID",
      "You'll get a login to track every step",
    ],
  },
  {
    title: "Assessment & interaction",
    when: "Within 2 weeks",
    text: "An age-appropriate assessment and a friendly conversation. For younger children, a play-based morning in class.",
    details: [
      "Pre-Prep: a morning in class with our teachers",
      "Prep onwards: English, maths and reasoning",
      "A conversation with the head of section — for you and your daughter",
    ],
  },
  {
    title: "Review & confirmation",
    when: "Within 1 week of assessment",
    text: "We review the assessment, reports and conversation together, then write to you with a decision.",
    details: [
      "Offer, waitlist or a kind 'not this time'",
      "Scholarship and bursary outcomes shared at the same time",
      "Offer letter downloadable from your dashboard",
    ],
  },
  {
    title: "Fee payment & seat confirmation",
    when: "Within 14 days of offer",
    text: "Accept the offer by paying the admission fee and the first instalment online. Your daughter's place is confirmed instantly.",
    details: [
      "Pay by UPI, card or netbanking, or by bank transfer",
      "Choose a 1, 2 or 3-instalment plan",
      "Receipts issued automatically",
    ],
  },
  {
    title: "Orientation & joining",
    when: "Before term",
    text: "A welcome pack, uniform fitting, a buddy and an orientation day so the first morning feels familiar.",
    details: [
      "Parent portal access for fees, circulars and reports",
      "Buddy from the same year group",
      "Boarders: a settling-in weekend with their house",
    ],
  },
];

const FAQ = [
  [
    "When can my daughter join?",
    "Our main entry points are Nursery, Reception, Year 3, Year 7, Year 9 and Year 12, but we welcome girls into any year when places are available.",
  ],
  [
    "Is there an entrance exam?",
    "There is an age-appropriate assessment. It helps us understand how to support your daughter; it is not a pass-or-fail test for younger children.",
  ],
  [
    "Do you accept girls from other curricula?",
    "Yes. Many of our girls join from CBSE, ICSE, IB and state boards. We provide transition support in English and mathematics where needed.",
  ],
  ["Can we visit before registering?", "Please do. Book a private tour or come to an Open Morning."],
] as const;

export default function AdmissionsPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
      <PageHero
        eyebrow="Admissions"
        title="Joining Aurelia Hall"
        intro="Six clear steps from your first question to your daughter's first day. We'll guide you through each one."
        image="/images/admissions.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Admissions", href: "/admissions" },
        ]}
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/admissions/register"
            className="rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper hover:bg-damson-700"
          >
            Start registration
          </Link>
          <Link
            href="/book-a-tour"
            className="rounded-full border border-line-strong px-6 py-3 font-semibold hover:bg-paper"
          >
            Book a visit
          </Link>
        </div>
      </PageHero>

      <section className="container-site py-20">
        <SectionHeader
          eyebrow="The journey"
          title="How admissions work"
          intro="Select a step to see what happens and how long it takes."
        />
        <div className="mt-12">
          <AdmissionsJourney steps={STEPS} />
        </div>
      </section>

      <section className="border-y border-line bg-cream/60">
        <ul className="container-site grid gap-8 py-14 md:grid-cols-3">
          {[
            {
              icon: IndianRupee,
              title: "Fees, explained",
              text: "Every fee, instalment and policy in one place.",
              href: "/admissions/fees/full-boarding",
              cta: "See fees",
            },
            {
              icon: FileText,
              title: "Scholarships & bursaries",
              text: "Up to 50% merit scholarships; bursaries up to 100%.",
              href: "/admissions/scholarships",
              cta: "See scholarships",
            },
            {
              icon: CalendarDays,
              title: "Open Mornings",
              text: "Meet the Principal, see lessons, talk to our girls.",
              href: "/events",
              cta: "See dates",
            },
          ].map((c) => (
            <li key={c.title} data-reveal>
              <c.icon className="size-6 text-kiln-700" aria-hidden />
              <p className="mt-3 font-serif text-2xl text-primary">{c.title}</p>
              <p className="mt-1 text-muted">{c.text}</p>
              <Link
                href={c.href}
                className="mt-3 inline-block text-sm font-medium text-damson-800 underline decoration-marigold-500 underline-offset-4"
              >
                {c.cta}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-site grid gap-14 py-20 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <SectionHeader eyebrow="Questions" title="Often asked" />
          <Accordion type="single" collapsible className="mt-6">
            {FAQ.map(([q, a]) => (
              <AccordionItem key={q} value={q} title={q}>
                {a}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-soft sm:p-10" id="enquire">
          <h2 className="t-h3 text-primary">Talk to admissions</h2>
          <p className="mt-2 mb-6 text-sm text-muted">We&apos;ll call you within one working day.</p>
          <EnquiryForm source="admissions" />
        </div>
      </section>
    </>
  );
}
