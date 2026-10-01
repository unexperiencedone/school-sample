import { Download, FileText } from "lucide-react";
import { PageHero } from "@/components/site/blocks";
import { getResources } from "@/lib/content";
import { pageMetadata } from "@/lib/seo/metadata";
import { TrackedLink } from "@/components/site/tracked-link";

export const metadata = pageMetadata({
  title: "Resources & downloads",
  description: "Forms, fee structures and guides for families and job applicants.",
  path: "/resources",
  image: "/images/resources.webp",
});

export default function ResourcesPage() {
  const resources = getResources();
  const categories = [...new Set(resources.map((r) => r.category))];
  return (
    <>
      <PageHero
        eyebrow="Downloads"
        title="Resources"
        intro="Forms and guides for families and job applicants. Most can also be completed online."
        image="/images/resources.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Resources", href: "/resources" },
        ]}
      />
      <section className="container-site py-16">
        {categories.map((cat) => (
          <div key={cat} className="grid gap-6 border-t border-line py-10 lg:grid-cols-[14rem_1fr]">
            <h2 className="font-serif text-2xl text-kiln-700">{cat}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {resources
                .filter((r) => r.category === cat)
                .map((r) => (
                  <li key={r.slug}>
                    <TrackedLink
                      href={r.href ?? `/api/resources/${r.slug}`}
                      event="brochure_download"
                      props={{ resource: r.slug }}
                      className="group flex h-full gap-4 rounded-lg border border-line bg-elevated p-5 transition-shadow hover:shadow-lift"
                    >
                      <FileText className="size-8 shrink-0 text-damson-600" aria-hidden />
                      <span className="flex-1">
                        <span className="block font-medium text-fg group-hover:underline">{r.title}</span>
                        <span className="mt-1 block text-sm text-muted">{r.description}</span>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-kiln-700">
                          <Download className="size-3.5" aria-hidden /> PDF · {r.pages} page
                          {r.pages > 1 ? "s" : ""}
                        </span>
                      </span>
                    </TrackedLink>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
