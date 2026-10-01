import Link from "next/link";
import { PageHero } from "@/components/site/blocks";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { listOpenVacancies, vacancyFacets } from "@/lib/services/vacancies";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Vacancies",
  description: "Current teaching and support vacancies at Aurelia Hall (sample).",
  path: "/careers/vacancies",
  image: "/images/careers.webp",
});

type Props = { searchParams: Promise<{ department?: string; employment?: string; q?: string }> };

/** Vacancy list with GET-form filters (works without JavaScript). */
export default async function VacanciesPage({ searchParams }: Props) {
  const f = await searchParams;
  const [vacancies, facets] = await Promise.all([listOpenVacancies(f), vacancyFacets()]);
  return (
    <>
      <PageHero
        eyebrow="Careers"
        title="Vacancies"
        intro="All roles are sample listings for this demonstration."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Careers", href: "/careers" },
          { name: "Vacancies", href: "/careers/vacancies" },
        ]}
      />
      <section className="container-site grid gap-10 py-14 lg:grid-cols-[16rem_1fr]">
        <form
          method="get"
          className="space-y-4 lg:sticky lg:top-28 lg:self-start"
          aria-label="Filter vacancies"
        >
          <div>
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
              Keyword
            </label>
            <input
              id="q"
              name="q"
              defaultValue={f.q}
              className="h-11 w-full rounded-md border border-line-strong/70 bg-elevated px-3"
            />
          </div>
          <div>
            <label htmlFor="department" className="mb-1.5 block text-sm font-medium">
              Department
            </label>
            <Select id="department" name="department" defaultValue={f.department ?? ""}>
              <option value="">All departments</option>
              {facets.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="employment" className="mb-1.5 block text-sm font-medium">
              Type
            </label>
            <Select id="employment" name="employment" defaultValue={f.employment ?? ""}>
              <option value="">Any</option>
              {facets.employment.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-damson-800 px-5 py-2.5 text-sm font-semibold text-paper"
            >
              Filter
            </button>
            <Link href="/careers/vacancies" className="rounded-full px-4 py-2.5 text-sm text-muted underline">
              Reset
            </Link>
          </div>
        </form>
        <div>
          <p className="mb-4 text-sm text-muted" role="status">
            {vacancies.length} open role{vacancies.length === 1 ? "" : "s"}
          </p>
          {vacancies.length ? (
            <ul className="space-y-4">
              {vacancies.map((v) => (
                <li key={v.slug}>
                  <Link
                    href={`/careers/vacancies/${v.slug}`}
                    className="group block rounded-lg border border-line bg-elevated p-6 transition-shadow hover:shadow-lift"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-serif text-2xl text-primary group-hover:underline">{v.title}</h2>
                      <span className="text-sm text-kiln-700">Closes {formatDate(v.closesAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {v.department} · {v.employment} · {v.location}
                    </p>
                    <p className="mt-3">{v.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No roles match those filters"
              action={
                <Link href="/careers/vacancies" className="text-sm underline">
                  Clear filters
                </Link>
              }
            >
              Try a different department, or send a speculative application.
            </EmptyState>
          )}
        </div>
      </section>
    </>
  );
}
