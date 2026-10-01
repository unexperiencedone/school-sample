import Image from "next/image";
import Link from "next/link";
import { ArrowRight, HeartHandshake, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { HomeHero } from "@/components/site/hero";
import { CtaBand, SectionHeader, SplitFeature, StatStrip } from "@/components/site/blocks";
import { QuoteSlider } from "@/components/site/quote-slider";
import { ScrollRow } from "@/components/site/scroll-row";
import {
  getPosts,
  getRecognition,
  getSections,
  getSports,
  getTestimonials,
  getUpcomingEvents,
} from "@/lib/content";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";
import { school } from "@/config/school";

export const metadata = pageMetadata({
  title: `${school.name} — ${school.tagline}`,
  description: school.description,
  path: "/",
});

export default async function HomePage() {
  const [posts, events] = await Promise.all([getPosts(), getUpcomingEvents()]);
  const sections = getSections();

  return (
    <>
      <HomeHero />

      {/* Welcome — asymmetric editorial opener */}
      <section className="container-site py-20 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          <div data-reveal>
            <p className="t-eyebrow">Welcome</p>
            <h2 className="t-h1 mt-3 text-primary">
              A school that knows <em>every</em> girl by name.
            </h2>
          </div>
          <div data-reveal className="space-y-5 text-[1.12rem] leading-relaxed text-muted lg:pt-10">
            <p>
              Aurelia Hall is an all-girls British-curriculum school for ages {school.ages}, with day, flexi
              and full boarding. Small classes, specialist teachers and a fourteen-acre hillside campus give
              every girl room to grow — academically, creatively and as a person.
            </p>
            <p>
              We set high expectations and back them with warm, expert support. Our girls leave curious,
              capable and kind — ready to take on hard problems and to lift others as they rise.
            </p>
            <Link
              href="/about/welcome"
              className="inline-flex items-center gap-2 pt-2 font-medium text-damson-800 underline decoration-marigold-500 decoration-2 underline-offset-[6px]"
            >
              Read the Principal&apos;s welcome <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="mt-16">
          <StatStrip
            items={[
              { value: `${school.campusAcres}`, label: "acre hillside campus" },
              { value: "1:9", label: "teacher-to-pupil ratio" },
              { value: "4", label: "boarding houses" },
              { value: "12", label: "sports, everyone plays" },
            ]}
          />
        </div>
      </section>

      {/* Heritage / partnership strip */}
      <section aria-label="Heritage and partnerships" className="border-y border-line bg-cream/70">
        <div className="container-site flex flex-col items-center gap-6 py-10 text-center md:flex-row md:justify-between md:text-left">
          <p className="max-w-md font-serif text-2xl text-primary">
            British curriculum. Indian roots. <em>A global outlook.</em>
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm tracking-[0.14em] text-slate uppercase">
            <li>EYFS</li>
            <li aria-hidden>·</li>
            <li>Key Stages 1–3</li>
            <li aria-hidden>·</li>
            <li>IGCSE</li>
            <li aria-hidden>·</li>
            <li>A Level</li>
          </ul>
          <Link
            href="/about/partnerships"
            className="text-sm font-medium text-kiln-700 underline underline-offset-4"
          >
            Our partnerships
          </Link>
        </div>
      </section>

      {/* School sections — arched cards */}
      <section className="container-site py-20 lg:py-28">
        <SectionHeader
          align="split"
          eyebrow="Four schools in one"
          title="From first words to first degree."
          intro="Each section has its own head, its own spaces and its own rhythm — and the same promise: every girl known, stretched and cared for."
        />
        <ul className="mt-14 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-6 lg:grid-cols-4">
          {sections.map((s, i) => (
            <li key={s.slug} data-reveal style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}>
              <Link href={`/academics/${s.slug}`} className="group block">
                <div className="arch relative aspect-[3/4] overflow-hidden">
                  <Image
                    src={s.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-damson-950/80 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 text-paper sm:p-5">
                    <p className="text-xs tracking-[0.16em] text-marigold-300 uppercase">Ages {s.ages}</p>
                    <p className="mt-1 font-serif text-xl sm:text-2xl">{s.name}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted sm:text-sm">{s.tagline}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Pastoral & safety — dark band */}
      <section className="grain relative overflow-hidden bg-damson-900 text-paper">
        <div className="container-site grid gap-14 py-20 lg:grid-cols-[1fr_1.4fr] lg:py-28">
          <div data-reveal>
            <p className="t-eyebrow text-marigold-300">Care & safety</p>
            <h2 className="t-h2 mt-3">Happy girls learn. Safe girls thrive.</h2>
            <p className="mt-5 text-damson-100">
              Pastoral care isn&apos;t a department here — it&apos;s how the whole school works. Every adult
              is trained, every girl has a trusted adult, and every concern is taken seriously.
            </p>
            <Link
              href="/careers/community-of-care"
              className="mt-6 inline-flex items-center gap-2 text-marigold-300 underline underline-offset-4"
            >
              How we keep girls safe <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg bg-damson-700 sm:grid-cols-2">
            {[
              {
                icon: Users,
                title: "A tutor for every girl",
                text: "Small tutor groups and one-to-one check-ins every half-term.",
              },
              {
                icon: Stethoscope,
                title: "24/7 medical centre",
                text: "Nurses on campus day and night; counsellor on site daily.",
              },
              {
                icon: ShieldCheck,
                title: "Safeguarding first",
                text: "Safer recruitment, annual training for all staff, clear reporting.",
              },
              {
                icon: HeartHandshake,
                title: "Wellbeing curriculum",
                text: "Weekly lessons on sleep, friendships, digital life and resilience.",
              },
            ].map((f, i) => (
              <li
                key={f.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
                className="bg-damson-900 p-7"
              >
                <f.icon className="size-6 text-marigold-500" aria-hidden />
                <p className="mt-4 font-serif text-xl">{f.title}</p>
                <p className="mt-1.5 text-sm text-damson-300">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sports carousel */}
      <section className="container-site py-20 lg:py-28">
        <SectionHeader
          eyebrow="Sport"
          title="Everyone plays. Everyone improves."
          intro="Twelve sports, A to D teams, and coaches who care as much about the girl on the bench as the girl on the podium."
        />
        <div className="mt-6">
          <ScrollRow label="sports">
            {getSports().map((s) => (
              <li key={s.slug} className="w-[72%] shrink-0 snap-start sm:w-[40%] lg:w-[23%]">
                <Link href={`/sports/${s.slug}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
                    <Image
                      src={s.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 22vw, 70vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-3 font-serif text-xl text-primary group-hover:text-kiln-700">{s.name}</p>
                  <p className="text-sm text-muted">{s.summary}</p>
                </Link>
              </li>
            ))}
          </ScrollRow>
        </div>
      </section>

      {/* Principal's note */}
      <section className="bg-cream/70 py-20 lg:py-28">
        <div className="container-site">
          <SplitFeature
            image="/images/about-founding-principal.webp"
            alt="The Principal's study"
            eyebrow="From the Principal"
            title="“Ambition and kindness are not opposites. We teach them together.”"
            cta={{ label: "Meet our Founding Principal", href: "/about/founding-principal" }}
          >
            <p>
              Dr. Helena Varghese founded Aurelia Hall after twenty-five years in classrooms on three
              continents. She still teaches a Sixth Form seminar every Monday.
            </p>
            <p className="text-xs">Fictional principal, sample content.</p>
          </SplitFeature>
        </div>
      </section>

      {/* Recognition strip */}
      <section aria-labelledby="recog" className="container-site py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
          <h2 id="recog" className="shrink-0 font-serif text-2xl text-primary lg:w-56">
            Recognised for <em>how</em> we teach
          </h2>
          <ul className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
            {getRecognition().map((r) => (
              <li key={r.title} className="bg-paper p-5 text-center">
                <p className="font-serif text-2xl text-marigold-700">{r.year}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{r.title}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-right text-xs text-muted">
          Illustrative recognitions for the sample build.{" "}
          <Link href="/about/recognition" className="underline">
            About our recognition
          </Link>
        </p>
      </section>

      {/* Boarding teaser — reversed split */}
      <section className="container-site py-16 lg:py-24">
        <SplitFeature
          reverse
          image="/images/feature-boarding.webp"
          alt="A boarding house common room in the evening"
          eyebrow="Boarding"
          title="The kindest version of home."
          cta={{ label: "Explore boarding", href: "/boarding/full" }}
        >
          <p>
            Four houses, each with a houseparent family living in. Full boarding from Year 5, flexi boarding
            two to four nights a week, and day boarding with supper and supervised prep.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {[
              ["Full", "/boarding/full"],
              ["Flexi", "/boarding/flexi"],
              ["Day", "/boarding/day"],
            ].map(([l, h]) => (
              <li key={h}>
                <Link
                  href={h!}
                  className="inline-block rounded-full border border-line-strong px-4 py-1.5 text-sm text-fg hover:border-damson-800 hover:bg-damson-50"
                >
                  {l} boarding
                </Link>
              </li>
            ))}
          </ul>
        </SplitFeature>
      </section>

      {/* Testimonials */}
      <section className="bg-damson-50 py-20 lg:py-28">
        <div className="container-site grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div data-reveal>
            <p className="t-eyebrow">In their words</p>
            <h2 className="t-h2 mt-3 text-primary">What families and girls tell us.</h2>
            <p className="mt-4 text-sm text-muted">Sample testimonials, written for this demonstration.</p>
          </div>
          <QuoteSlider quotes={getTestimonials().map((t) => ({ text: t.quote, by: t.by }))} />
        </div>
      </section>

      {/* Blog + events */}
      <section className="container-site grid gap-16 py-20 lg:grid-cols-[2fr_1fr] lg:py-28">
        <div>
          <SectionHeader eyebrow="From the blog" title="Life on the hill." />
          <ul className="mt-10 grid gap-8 sm:grid-cols-2">
            {posts.slice(0, 2).map((p) => (
              <li key={p.slug} data-reveal>
                <Link href={`/blog/${p.slug}`} className="group block">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg">
                    <Image
                      src={p.frontmatter.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 30vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="mt-4 text-xs tracking-wider text-kiln-700 uppercase">
                    {formatDate(p.frontmatter.date)} · {p.readingMinutes} min read
                  </p>
                  <h3 className="mt-1 font-serif text-2xl leading-snug text-primary group-hover:underline">
                    {p.frontmatter.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{p.frontmatter.description}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/blog"
            className="mt-8 inline-flex items-center gap-2 font-medium text-damson-800 underline decoration-marigold-500 decoration-2 underline-offset-[6px]"
          >
            All stories <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <aside aria-labelledby="events-h">
          <h2 id="events-h" className="t-eyebrow">
            Coming up
          </h2>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {events.slice(0, 4).map((e) => (
              <li key={e.slug} className="py-5">
                <Link href={`/events#${e.slug}`} className="group grid grid-cols-[4rem_1fr] gap-4">
                  <span className="text-center">
                    <span className="block font-serif text-4xl leading-none text-primary">
                      {formatDate(e.startsAt, "d")}
                    </span>
                    <span className="text-xs tracking-wider text-kiln-700 uppercase">
                      {formatDate(e.startsAt, "MMM")}
                    </span>
                  </span>
                  <span>
                    <span className="block font-medium text-fg group-hover:underline">{e.title}</span>
                    <span className="block text-sm text-muted">{e.location}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/events"
            className="mt-6 inline-block text-sm font-medium text-kiln-700 underline underline-offset-4"
          >
            All events
          </Link>
        </aside>
      </section>

      <CtaBand
        title="Admissions are open for 2027–28"
        text="Register online in about ten minutes, or start with a conversation — we'll guide you through every step."
        primary={{ label: "Start registration", href: "/admissions/register" }}
        secondary={{ label: "How admissions work", href: "/admissions" }}
      />
    </>
  );
}
