import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Breadcrumb } from "@/components/site/blocks";
import { JsonLd } from "@/components/site/json-ld";
import { getVacancy } from "@/lib/services/vacancies";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";
import { school, siteUrl } from "@/config/school";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 300;

export async function generateMetadata({ params }: Props) {
  const v = await getVacancy((await params).slug);
  return v
    ? pageMetadata({
        title: `${v.title} — Vacancy`,
        description: v.summary,
        path: `/careers/vacancies/${v.slug}`,
        noindex: v.status !== "OPEN",
      })
    : {};
}

export default async function VacancyPage({ params }: Props) {
  const v = await getVacancy((await params).slug);
  if (!v || v.status === "DRAFT") notFound();
  const open = v.status === "OPEN" && v.closesAt >= new Date();
  return (
    <>
      {open && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "JobPosting",
            title: v.title,
            description: v.description.replace(/\n/g, "<br>"),
            datePosted: v.createdAt.toISOString().slice(0, 10),
            validThrough: v.closesAt.toISOString(),
            employmentType: v.employment.toLowerCase().includes("part") ? "PART_TIME" : "FULL_TIME",
            hiringOrganization: { "@type": "Organization", name: school.name, sameAs: siteUrl() },
            jobLocation: {
              "@type": "Place",
              address: { "@type": "PostalAddress", addressLocality: school.city, addressCountry: "IN" },
            },
          }}
        />
      )}
      <section className="container-site py-10 lg:py-16">
        <Breadcrumb
          items={[
            { name: "Home", href: "/" },
            { name: "Careers", href: "/careers" },
            { name: "Vacancies", href: "/careers/vacancies" },
            { name: v.title, href: `/careers/vacancies/${v.slug}` },
          ]}
        />
        <div className="mt-10 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          <article>
            <p className="t-eyebrow">{v.department}</p>
            <h1 className="t-h1 mt-3 text-primary">{v.title}</h1>
            <p className="t-lead mt-4">{v.summary}</p>
            <div className="prose-school mt-10">
              {v.description.split(/\n{2,}/).map((p) => (
                <p key={p.slice(0, 20)}>{p}</p>
              ))}
              <h2>What we&apos;re looking for</h2>
              <ul>
                {v.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </article>
          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <dl className="space-y-4 rounded-lg border border-line bg-elevated p-6 text-sm">
              {[
                ["Type", v.employment],
                ["Location", v.location],
                ["Closing date", formatDate(v.closesAt, "d MMMM yyyy")],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{val}</dd>
                </div>
              ))}
            </dl>
            {open ? (
              <Link
                href={`/careers/apply?vacancy=${v.slug}`}
                className="block rounded-full bg-damson-800 px-6 py-3.5 text-center font-semibold text-paper hover:bg-damson-700"
              >
                Apply for this role
              </Link>
            ) : (
              <p className="rounded-md bg-sunken px-4 py-3 text-sm text-muted">This vacancy has closed.</p>
            )}
            <ul className="space-y-2 text-sm text-muted">
              {[
                "Online form saves as you go",
                "Safer-recruitment checks apply",
                "CVs are not accepted in place of the form",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 text-success" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}
