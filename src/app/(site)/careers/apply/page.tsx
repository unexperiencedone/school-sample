import { PageHero } from "@/components/site/blocks";
import { StaffApplicationForm } from "@/components/forms/staff-application/staff-application-form";
import { listOpenVacancies } from "@/lib/services/vacancies";
import { school } from "@/config/school";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = {
  ...pageMetadata({
    title: "Apply to work with us",
    description: "The Aurelia Hall staff application form (sample).",
    path: "/careers/apply",
    noindex: true,
  }),
  // The resume link carries a secret; never pass it on in a Referer header.
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ vacancy?: string; resume?: string; id?: string }> };

export default async function ApplyPage({ searchParams }: Props) {
  const q = await searchParams;
  const open = await listOpenVacancies();
  const vacancies = open.map((v) => ({
    slug: v.slug,
    title: v.title,
    department: v.department,
    employment: v.employment,
    closesAt: v.closesAt.toISOString(),
  }));
  const chosen = vacancies.some((v) => v.slug === q.vacancy) ? (q.vacancy ?? "") : "";
  const resume = q.resume && q.id ? { id: q.id, token: q.resume } : undefined;

  return (
    <>
      <PageHero
        eyebrow="Careers"
        title="Apply to work with us"
        intro="Nine short sections, saved as you go. You will get a link by email so you can finish on any device."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Careers", href: "/careers" },
          { name: "Apply", href: "/careers/apply" },
        ]}
      />
      <section className="container-site grid gap-12 py-12 lg:grid-cols-[1fr_18rem] lg:py-16">
        <div className="min-w-0">
          {q.vacancy && !chosen && (
            <p role="status" className="mb-8 rounded-md bg-warning-bg px-4 py-3 text-sm text-warning">
              That vacancy is not open for applications any more. You can choose another in step 1, or send a
              general application.
            </p>
          )}
          <StaffApplicationForm vacancies={vacancies} initialVacancy={chosen} resume={resume} />
        </div>
        <aside className="space-y-4 text-sm text-muted lg:sticky lg:top-28 lg:self-start">
          <p className="font-serif text-xl text-primary">Before you start</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Allow about 20 minutes. Your answers save each time you move to the next step.</li>
            <li>Have your qualifications, job dates and two referees to hand.</li>
            <li>Certificates can be attached as PDF, JPG, PNG or WebP files up to 5 MB.</li>
            <li>A CV on its own can&apos;t be considered. We read the form.</li>
          </ul>
          <p>
            Safer recruitment applies to every post. Questions? Email{" "}
            <a className="underline" href={`mailto:${school.contact.careersEmail}`}>
              {school.contact.careersEmail}
            </a>
            .
          </p>
        </aside>
      </section>
    </>
  );
}
