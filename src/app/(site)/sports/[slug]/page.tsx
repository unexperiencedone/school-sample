import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSport, getSports } from "@/lib/content";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { JsonLd, breadcrumbJsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return getSports().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props) {
  const s = getSport((await params).slug);
  return s
    ? pageMetadata({
        title: `${s.name} — Sport`,
        description: s.summary,
        path: `/sports/${s.slug}`,
        image: s.image,
      })
    : {};
}

export default async function SportPage({ params }: Props) {
  const s = getSport((await params).slug);
  if (!s) notFound();
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Sport", href: "/campus/sports" },
    { name: s.name, href: `/sports/${s.slug}` },
  ];
  const others = getSports()
    .filter((x) => x.slug !== s.slug)
    .slice(0, 4);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <PageHero
        eyebrow={`Sport · ${s.season}`}
        title={s.name}
        intro={s.summary}
        image={s.image}
        alt=""
        crumbs={crumbs}
      />
      <section className="container-site grid gap-14 py-20 lg:grid-cols-[1.4fr_1fr]">
        <div data-reveal className="prose-school max-w-2xl">
          <p className="t-lead !text-fg">{s.body}</p>
        </div>
        <dl className="space-y-6 rounded-lg border border-line bg-elevated p-7">
          <div>
            <dt className="t-eyebrow">Facilities</dt>
            <dd className="mt-2">
              <ul className="space-y-1">
                {s.facilities.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="t-eyebrow">Levels</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {s.levels.map((l) => (
                <span key={l} className="rounded-full bg-damson-50 px-3 py-1 text-sm text-damson-800">
                  {l}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="t-eyebrow">When</dt>
            <dd className="mt-2">{s.schedule}</dd>
          </div>
        </dl>
      </section>
      <section className="container-site pb-20">
        <h2 className="t-h3 text-primary">More sport</h2>
        <ul className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/sports/${o.slug}`} className="group block">
                <div className="arch-sm relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={o.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 22vw, 45vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <p className="mt-2 font-serif text-lg text-primary">{o.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand
        title="Want to see a fixture?"
        text="Visitors are welcome at home matches. Ask our admissions team when you book a tour."
        primary={{ label: "Book a visit", href: "/book-a-tour" }}
      />
    </>
  );
}
