import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import type { BoardingType } from "@prisma/client";
import { PageHero } from "@/components/site/blocks";
import { FeeTables } from "@/components/site/fee-tables";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { publicFeeSchedule, BOARDING_LABEL } from "@/lib/services/fee-data";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";
import { school } from "@/config/school";
import { cn } from "@/lib/utils";

const PAGES: Record<
  string,
  { title: string; boarding: BoardingType[]; intro: string; other: { href: string; label: string } }
> = {
  "full-boarding": {
    title: "Fees: full & flexi boarding",
    boarding: ["FULL", "FLEXI"],
    intro:
      "Tuition, boarding and everything in between — with instalment options, concessions and policies, all in one place.",
    other: { href: "/admissions/fees/day-boarding", label: "Day boarding fees" },
  },
  "day-boarding": {
    title: "Fees: day boarding",
    boarding: ["DAY"],
    intro:
      "A full school day with supper and supervised prep. Here's exactly what it costs and how you can pay.",
    other: { href: "/admissions/fees/full-boarding", label: "Full & flexi boarding fees" },
  },
};

type Props = { params: Promise<{ boarding: string }>; searchParams: Promise<{ year?: string }> };

export const dynamicParams = false;
export const revalidate = 300;
export function generateStaticParams() {
  return Object.keys(PAGES).map((boarding) => ({ boarding }));
}
export async function generateMetadata({ params }: Props) {
  const { boarding } = await params;
  const p = PAGES[boarding];
  return p
    ? pageMetadata({
        title: p.title,
        description: p.intro,
        path: `/admissions/fees/${boarding}`,
        image: "/images/fees.webp",
      })
    : {};
}

/** Fee pages: every number is computed by the fee engine from the active fee structures — never hard-coded. */
export default async function FeesPage({ params, searchParams }: Props) {
  const { boarding } = await params;
  const { year } = await searchParams;
  const page = PAGES[boarding];
  if (!page) notFound();
  const schedule = await publicFeeSchedule(page.boarding, year);
  if (!schedule) notFound();
  const path = `/admissions/fees/${boarding}`;
  const pdfHref = `/api/fees/pdf?boarding=${page.boarding.join(",")}&year=${schedule.year.name}`;
  const rp = schedule.refundPolicy;
  const lf = schedule.lateFee;

  return (
    <>
      <PageHero
        eyebrow={`Admissions · ${schedule.year.name}`}
        title={page.title}
        intro={page.intro}
        image="/images/fees.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Admissions", href: "/admissions" },
          { name: page.title, href: path },
        ]}
      >
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={pdfHref}
            className="inline-flex items-center gap-2 rounded-full bg-damson-800 px-5 py-2.5 text-sm font-semibold text-paper hover:bg-damson-700"
          >
            <Download className="size-4" aria-hidden /> Download PDF
          </a>
          <Link
            href={page.other.href}
            className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold hover:bg-paper"
          >
            {page.other.label}
          </Link>
          {schedule.years.length > 1 && (
            <nav aria-label="Academic year" className="flex gap-1 rounded-full bg-cream p-1 text-sm">
              {schedule.years.map((y) => (
                <Link
                  key={y.name}
                  href={`${path}?year=${y.name}`}
                  aria-current={y.name === schedule.year.name ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5",
                    y.name === schedule.year.name ? "bg-paper font-semibold shadow-soft" : "text-slate",
                  )}
                >
                  {y.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </PageHero>

      <section className="container-site py-12">
        <p className="mb-8 rounded-md border border-marigold-300 bg-marigold-100/50 px-4 py-3 text-sm text-marigold-700">
          Sample build: all fees are fictional placeholders. They are generated live from the fee engine
          configured in the CRM, so a fee revision there updates this page and the PDF automatically.
        </p>
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-cream p-5">
            <p className="text-xs tracking-wider text-muted uppercase">Registration (one-time)</p>
            <p className="mt-1 font-serif text-3xl text-primary">
              {formatINR(schedule.bands[0]?.columns[0]?.registrationPaise ?? school.registrationFeePaise)}
            </p>
            <p className="text-xs text-muted">Paid online at registration. Non-refundable.</p>
          </div>
          {schedule.rebate && (
            <div className="rounded-lg bg-cream p-5">
              <p className="text-xs tracking-wider text-muted uppercase">Advance payment rebate</p>
              <p className="mt-1 font-serif text-3xl text-primary">
                {formatINR(schedule.rebate.amountPaise)}
              </p>
              <p className="text-xs text-muted">
                Pay the year in full by {formatDate(schedule.rebate.payByDate, "d MMMM yyyy")}.
              </p>
            </div>
          )}
          <div className="rounded-lg bg-cream p-5">
            <p className="text-xs tracking-wider text-muted uppercase">Pocket money (imprest), per term</p>
            <p className="mt-1 font-serif text-3xl text-primary">
              {schedule.imprest
                .filter((i) => page.boarding.includes(i.boarding))
                .map((i) => formatINR(i.amountPerTermPaise))
                .join(" / ")}
            </p>
            <p className="text-xs text-muted">
              {page.boarding.map((b) => BOARDING_LABEL[b]).join(" / ")}. Held in your daughter&apos;s ledger.
            </p>
          </div>
        </div>
        <FeeTables schedule={schedule} />
      </section>

      <section className="border-t border-line bg-cream/50">
        <div className="container-site grid gap-12 py-16 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="t-eyebrow">Policies</p>
            <h2 className="t-h2 mt-3 text-primary">The small print, in plain English</h2>
          </div>
          <Accordion type="multiple" defaultValue={["instalments"]}>
            <AccordionItem value="instalments" title="Instalments and due dates">
              Choose to pay annually, in two instalments (60% in April, 40% in October) or in three termly
              instalments (40% / 30% / 30% in April, September and January). One-time fees for new pupils —
              admission and first-year uniform — are included in the first instalment. Your plan is set when
              your invoice is issued.
            </AccordionItem>
            <AccordionItem value="methods" title="How to pay">
              Pay online from the parent portal by UPI, debit or credit card, or netbanking; or by bank
              transfer or demand draft (reference your daughter&apos;s admission number). Receipts are issued
              automatically and are always available in the portal.
            </AccordionItem>
            {lf && (
              <AccordionItem value="late" title="Late payment">
                A late fee of {lf.ratePerMonthBp / 100}% per month (or part month) applies to overdue amounts
                after a grace period of {lf.graceDays} days, shown as a separate line on your invoice. If fees
                remain unpaid {lf.cancelFlagAfterDays} days after the due date, the school will contact you to
                agree a plan; places are never withdrawn without a conversation. Late fees may be waived in
                genuine hardship — please talk to us.
              </AccordionItem>
            )}
            {schedule.rebate && (
              <AccordionItem value="rebate" title="Advance payment rebate">
                Families who choose the single annual payment and pay in full by{" "}
                {formatDate(schedule.rebate.payByDate, "d MMMM yyyy")} receive a rebate of{" "}
                {formatINR(schedule.rebate.amountPaise)}, deducted on the invoice. If payment arrives after
                that date the rebate is withdrawn.
              </AccordionItem>
            )}
            <AccordionItem value="concessions" title="Sibling, founding-family and scholarship concessions">
              <ul className="list-disc space-y-2 pl-5">
                {schedule.concessions.map((c) => (
                  <li key={c.code}>
                    <strong className="text-fg">{c.name}</strong> — {c.description}
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Concessions are applied in a fixed order, each to the remaining amount, and some cannot be
                combined. Your invoice shows exactly how each one was calculated.
              </p>
            </AccordionItem>
            <AccordionItem value="imprest" title="Imprest (pocket money) account">
              Each term a small amount is held in your daughter&apos;s imprest ledger for tuck-shop, outings,
              stationery and personal expenses. You can see every transaction and top up from the parent
              portal. Unused balances roll over and are refunded when she leaves.
            </AccordionItem>
            <AccordionItem value="refunds" title="Withdrawal and refunds">
              <p>
                <strong className="text-fg">New pupils:</strong> if you withdraw before the session starts,{" "}
                {rp.newPupil.beforeStartBp / 100}% of refundable fees paid are returned; after the session
                starts, {rp.newPupil.afterStartBp / 100}%. Registration, admission and uniform fees are
                non-refundable.
              </p>
              <p className="mt-2">
                <strong className="text-fg">Existing pupils:</strong> we ask for {rp.existingPupil.noticeDays}{" "}
                days&apos; written notice (you can submit it from the parent portal). Refundable fees for the
                unused part of the year are returned pro rata; with shorter notice,{" "}
                {Math.round(rp.existingPupil.inLieuOfNoticeBp / 100)}% of the year&apos;s refundable fees are
                retained in lieu of notice.
              </p>
              <p className="mt-2">
                Refunds are made to the original payment method within 30 days of approval.
              </p>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </>
  );
}
