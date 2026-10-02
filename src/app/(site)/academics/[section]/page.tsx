import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { getSection, getSections } from "@/lib/content";
import { Breadcrumb, CtaBand, StatStrip } from "@/components/site/blocks";
import { QuoteSlider } from "@/components/site/quote-slider";
import { JsonLd, breadcrumbJsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ section: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return getSections().map((s) => ({ section: s.slug }));
}

export async function generateMetadata({ params }: Props) {
  const s = getSection((await params).section);
  return s
    ? pageMetadata({
        title: `${s.name} (ages ${s.ages})`,
        description: s.tagline,
        path: `/academics/${s.slug}`,
        image: s.image,
      })
    : {};
}

/** School-section template: age band, intro, quotes, subjects, wellbeing, beyond the classroom, prev/next. */
export default async function SectionPage({ params }: Props) {
  const s = getSection((await params).section);
  if (!s) notFound();
  const all = getSections();
  const idx = all.findIndex((x) => x.slug === s.slug);
  const prev = all[idx - 1];
  const next = all[idx + 1];
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Academics", href: "/academics/curriculum" },
    { name: s.name, href: `/academics/${s.slug}` },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <section className="relative isolate overflow-hidden bg-damson-900 text-paper">
        <Image
          src={s.image}
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="-z-10 object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-damson-950/90 to-damson-950/30" />
        <div className="container-site py-14 lg:py-24">
          <div className="[&_a]:text-damson-100 [&_span]:text-damson-300">
            <Breadcrumb items={crumbs} />
          </div>
          <div className="mt-10 grid items-end gap-8 lg:grid-cols-[auto_1fr]">
            <p className="font-serif text-[clamp(4rem,12vw,9rem)] leading-none text-marigold-300">{s.ages}</p>
            <div>
              <p className="t-eyebrow text-marigold-300">
                {s.years} · {s.stage}
              </p>
              <h1 className="t-h1 mt-2">{s.name}</h1>
              <p className="mt-3 max-w-xl text-lg text-damson-100">{s.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-site grid gap-14 py-20 lg:grid-cols-[1.2fr_1fr] lg:py-24">
        <div data-reveal>
          <p className="t-lead !text-fg">{s.intro}</p>
          <div className="mt-10">
            <StatStrip items={s.stats} />
          </div>
        </div>
        <div className="rounded-lg bg-damson-50 p-8 lg:p-10">
          <QuoteSlider quotes={s.quotes} />
        </div>
      </section>

      <section className="border-y border-line bg-cream/60">
        <div className="container-site grid gap-14 py-20 lg:grid-cols-3">
          <div data-reveal className="lg:col-span-1">
            <p className="t-eyebrow">What she&apos;ll learn</p>
            <h2 className="t-h2 mt-3 text-primary">Subjects</h2>
          </div>
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:col-span-2">
            {s.subjects.map((sub) => (
              <li key={sub} data-reveal className="flex items-baseline gap-3 border-b border-line pb-3">
                <Check className="size-4 shrink-0 translate-y-0.5 text-kiln-700" aria-hidden />
                <span>{sub}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-site grid gap-12 py-20 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div data-reveal>
          <p className="t-eyebrow">Wellbeing</p>
          <h2 className="t-h2 mt-3 text-primary">Known and cared for</h2>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-muted">{s.wellbeing}</p>
        </div>
        <div data-reveal>
          <p className="t-eyebrow">Beyond the classroom</p>
          <h2 className="t-h2 mt-3 text-primary">Every afternoon, something new</h2>
          <ul className="mt-5 space-y-3">
            {s.beyond.map((b) => (
              <li key={b} className="flex gap-3 text-[1.02rem]">
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-t-full bg-marigold-500" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <nav aria-label="Other sections" className="container-site grid gap-4 pb-20 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/academics/${prev.slug}`}
            className="group rounded-lg border border-line p-6 hover:bg-cream"
          >
            <span className="flex items-center gap-2 text-sm text-muted">
              <ArrowLeft className="size-4" aria-hidden /> Previous section
            </span>
            <span className="mt-1 block font-serif text-2xl text-primary">
              {prev.name} <span className="text-base text-muted">({prev.ages})</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/academics/${next.slug}`}
            className="group rounded-lg border border-line p-6 text-right hover:bg-cream"
          >
            <span className="flex items-center justify-end gap-2 text-sm text-muted">
              Next section <ArrowRight className="size-4" aria-hidden />
            </span>
            <span className="mt-1 block font-serif text-2xl text-primary">
              {next.name} <span className="text-base text-muted">({next.ages})</span>
            </span>
          </Link>
        )}
      </nav>
      <CtaBand
        title={`Thinking about ${s.name}?`}
        text="Come and see a lesson in action, or start a conversation with our admissions team."
        primary={{ label: "Book a visit", href: "/book-a-tour" }}
        secondary={{ label: "Registration", href: "/admissions/register" }}
      />
    </>
  );
}
