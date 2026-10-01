import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPage, getPageSlugs } from "@/lib/content";
import { renderMdx } from "@/components/site/mdx";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { JsonLd, breadcrumbJsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { crumbsFor } from "@/lib/seo/crumbs";
import { allStaticLinks } from "@/config/nav";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateStaticParams() {
  return (await getPageSlugs()).map((s) => ({ slug: s.split("/") }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug.join("/"));
  if (!page) return {};
  return pageMetadata({
    title: page.frontmatter.title,
    description: page.frontmatter.description,
    path: `/${page.slug}`,
    image: page.frontmatter.image,
  });
}

/** Renders every MDX page in content/pages with one of four editorial layouts. */
export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug.join("/"));
  if (!page) notFound();
  const fm = page.frontmatter;
  const path = `/${page.slug}`;
  const crumbs = crumbsFor(path, fm.title);
  const body = await renderMdx(page.body);
  const links = allStaticLinks();
  const related = (fm.related ?? [])
    .map((href) => links.find((l) => l.href === href) ?? { href, label: href })
    .slice(0, 3);
  const layout = fm.layout ?? "editorial";

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <PageHero
        eyebrow={fm.eyebrow}
        title={fm.title}
        intro={layout === "letter" || layout === "legal" ? undefined : fm.description}
        image={layout === "legal" ? undefined : fm.image}
        alt=""
        crumbs={crumbs}
      >
        {fm.updated && <p className="mt-4 text-sm text-muted">Last updated {formatDate(fm.updated)}</p>}
      </PageHero>

      <div
        className={cn(
          "py-16 lg:py-24",
          layout === "letter" && "bg-[linear-gradient(to_bottom,var(--paper),var(--cream))]",
        )}
      >
        <div
          className={cn(
            "container-site grid gap-14",
            layout !== "legal" && "lg:grid-cols-[minmax(0,1fr)_17rem]",
          )}
        >
          <article
            className={cn(
              "prose-school min-w-0",
              layout === "letter"
                ? "mx-auto max-w-[40rem] font-serif text-[1.18rem] leading-[1.8]"
                : "max-w-[44rem]",
              layout === "legal" && "mx-auto",
            )}
          >
            {layout === "profile" && (
              <div className="!mb-10 flex items-center gap-5">
                <div className="arch-sm relative size-28 shrink-0 overflow-hidden">
                  <Image
                    src="/images/portrait-1.webp"
                    alt="Illustrated portrait (sample)"
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>
                <p className="text-sm text-muted">Illustrated portrait — sample content.</p>
              </div>
            )}
            {body}
            {layout === "letter" && fm.signature && (
              <p className="!mt-10 font-serif text-2xl text-primary italic">{fm.signature}</p>
            )}
          </article>
          {layout !== "legal" && related.length > 0 && (
            <aside aria-label="Related pages" className="lg:sticky lg:top-28 lg:self-start">
              <p className="t-eyebrow">Keep exploring</p>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {related.map((r) => (
                  <li key={r.href}>
                    <Link
                      href={r.href}
                      className="group flex items-center justify-between py-3.5 font-serif text-lg text-primary"
                    >
                      {r.label}
                      <span
                        aria-hidden
                        className="text-kiln-700 transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
      {layout !== "legal" && (
        <CtaBand
          title="Come and see for yourself"
          text="The best way to know Aurelia Hall is to walk it. Open Mornings run every term; private tours most weekdays."
          primary={{ label: "Book a visit", href: "/book-a-tour" }}
          secondary={{ label: "Virtual tour", href: "/virtual-tour" }}
        />
      )}
    </>
  );
}
