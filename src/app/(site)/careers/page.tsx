import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CardGrid, CtaBand, PageHero, SectionHeader, SplitFeature } from "@/components/site/blocks";
import { listOpenVacancies } from "@/lib/services/vacancies";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Work with us",
  description: "Teach, care and grow at Aurelia Hall — vacancies, our ethos and life in Kesarbagh.",
  path: "/careers",
  image: "/images/careers.webp",
});
export const revalidate = 300;

export default async function CareersPage() {
  const vacancies = (await listOpenVacancies()).slice(0, 4);
  return (
    <>
      <PageHero
        eyebrow="Careers"
        title="Work with us"
        intro="We hire people who love their subject, like young people and want to keep getting better at what they do — then give them the time and support to do it."
        image="/images/careers.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Careers", href: "/careers" },
        ]}
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/careers/vacancies"
            className="rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper hover:bg-damson-700"
          >
            See vacancies
          </Link>
          <Link
            href="/careers/apply"
            className="rounded-full border border-line-strong px-6 py-3 font-semibold hover:bg-paper"
          >
            Application form
          </Link>
        </div>
      </PageHero>
      <section className="container-site py-20">
        <CardGrid
          items={[
            {
              title: "Our teaching ethos",
              text: "Know the girl, teach to the top, use evidence, stay curious.",
              href: "/careers/teaching-ethos",
            },
            {
              title: "Living in Kesarbagh",
              text: "On-campus homes, a hill-town community and weekends outdoors.",
              href: "/careers/living-in-kesarbagh",
            },
            {
              title: "A community of care",
              text: "Protected time, real support and a strong safeguarding culture.",
              href: "/careers/community-of-care",
            },
          ]}
        />
      </section>
      <section className="border-y border-line bg-cream/60 py-20">
        <div className="container-site">
          <SectionHeader
            align="split"
            eyebrow="Now hiring"
            title="Current vacancies"
            intro={
              <Link
                href="/careers/vacancies"
                className="inline-flex items-center gap-2 font-medium text-damson-800 underline underline-offset-4"
              >
                All vacancies <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {vacancies.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/careers/vacancies/${v.slug}`}
                  className="group grid gap-1 py-5 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <span>
                    <span className="block font-serif text-2xl text-primary group-hover:underline">
                      {v.title}
                    </span>
                    <span className="text-sm text-muted">
                      {v.department} · {v.employment}
                    </span>
                  </span>
                  <span className="text-sm text-kiln-700">Closes {formatDate(v.closesAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="container-site py-20">
        <SplitFeature
          image="/images/careers-care.webp"
          alt="Tea in the staff common room"
          eyebrow="Safer recruitment"
          title="Why we ask for a full application form"
          cta={{ label: "Start your application", href: "/careers/apply" }}
        >
          <p>
            Every appointment follows safer-recruitment practice. Our online form asks for a full employment
            history, references and a declaration, so we can&apos;t accept a CV instead — but it saves as you
            go, and you can come back to it from a link we email you.
          </p>
        </SplitFeature>
      </section>
      <CtaBand
        title="Don't see the right role?"
        text="We're always glad to hear from exceptional teachers. Send a speculative application."
        primary={{ label: "Apply speculatively", href: "/careers/apply" }}
      />
    </>
  );
}
