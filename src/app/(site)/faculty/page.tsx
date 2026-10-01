import Image from "next/image";
import Link from "next/link";
import { getFaculty } from "@/lib/content";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Faculty",
  description: "Meet the teachers and leaders of Aurelia Hall (fictional sample staff).",
  path: "/faculty",
  image: "/images/faculty.webp",
});

export default function FacultyPage() {
  const faculty = getFaculty();
  const departments = [...new Set(faculty.map((f) => f.department))];
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Our faculty"
        intro="Teachers who love their subjects and like young people — and who keep getting better at teaching. Everyone shown here is fictional, with illustrated portraits."
        image="/images/faculty.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "About", href: "/about/welcome" },
          { name: "Faculty", href: "/faculty" },
        ]}
      />
      <section className="container-site py-16">
        <p className="mb-8 text-sm text-muted">Departments: {departments.join(" · ")}</p>
        <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {faculty.map((f, i) => (
            <li key={f.slug} data-reveal style={{ ["--reveal-delay" as string]: `${(i % 4) * 70}ms` }}>
              <Link href={`/faculty/${f.slug}`} className="group block">
                <div className="arch relative aspect-[4/5] overflow-hidden bg-cream">
                  <Image
                    src={f.image}
                    alt={`Illustrated portrait of ${f.name} (sample)`}
                    fill
                    sizes="(min-width: 1024px) 22vw, 45vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <p className="mt-4 font-serif text-xl text-primary group-hover:underline">{f.name}</p>
                <p className="text-sm text-muted">{f.role}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand
        title="Want to teach here?"
        text="We're always glad to hear from thoughtful teachers."
        primary={{ label: "See vacancies", href: "/careers/vacancies" }}
        secondary={{ label: "Our teaching ethos", href: "/careers/teaching-ethos" }}
      />
    </>
  );
}
