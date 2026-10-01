import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import { Info } from "lucide-react";
import { altFor, getRecognition, getSections, getSports, getImageSlots } from "@/lib/content";
import { CardGrid, SplitFeature, StatStrip, Timeline } from "./blocks";
import { Gallery as GalleryClient } from "./gallery";

/** Components available inside MDX pages and posts. */
const components = {
  a: ({ href = "", children }: { href?: string; children: ReactNode }) =>
    href.startsWith("/") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  Lead: ({ children }: { children: ReactNode }) => (
    <p className="t-lead !text-[1.3rem] !leading-relaxed text-fg">{children}</p>
  ),
  Pull: ({ children, by }: { children: ReactNode; by?: string }) => (
    <figure className="!my-10 border-l-[3px] border-marigold-500 pl-6">
      <blockquote className="font-serif text-[1.65rem] leading-snug text-primary">{children}</blockquote>
      {by && <figcaption className="mt-3 text-sm text-muted">— {by}</figcaption>}
    </figure>
  ),
  Note: ({ children }: { children: ReactNode }) => (
    <aside className="flex gap-3 rounded-md border border-marigold-300 bg-marigold-100/50 px-4 py-3 text-sm text-marigold-700">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </aside>
  ),
  Values: ({ items }: { items: { name: string; text: string }[] }) => (
    <dl className="!my-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {items.map((v, i) => (
        <div key={v.name} data-reveal className="border-t-2 border-damson-800 pt-4">
          <dt className="flex items-baseline gap-3 font-serif text-2xl text-primary">
            <span className="text-sm text-kiln-700 tabular-nums">0{i + 1}</span>
            {v.name}
          </dt>
          <dd className="mt-2 text-muted">{v.text}</dd>
        </div>
      ))}
    </dl>
  ),
  Stats: ({ items }: { items: { value: string; label: string }[] }) => (
    <div className="!my-10">
      <StatStrip items={items} />
    </div>
  ),
  Timeline,
  Cards: ({ items }: { items: { title: string; text: string }[] }) => (
    <div className="not-prose !my-10">
      <CardGrid items={items} columns={2} />
    </div>
  ),
  Split: ({
    image,
    title,
    alt,
    children,
  }: {
    image: string;
    title: string;
    alt?: string;
    children: ReactNode;
  }) => (
    <div className="!my-14">
      <SplitFeature image={image} alt={alt ?? altFor(image)} title={title} shape="rect">
        {children}
      </SplitFeature>
    </div>
  ),
  Gallery: () => (
    <GalleryClient
      images={getImageSlots()
        .filter((s) => s.slot.startsWith("gallery-"))
        .map((s) => ({ src: s.localPath, alt: s.alt }))}
    />
  ),
  SportsGrid: () => (
    <ul className="!my-10 grid grid-cols-2 gap-4 md:grid-cols-3">
      {getSports().map((s) => (
        <li key={s.slug} data-reveal>
          <Link href={`/sports/${s.slug}`} className="group block">
            <div className="arch-sm relative aspect-[4/5] overflow-hidden">
              <Image
                src={s.image}
                alt=""
                fill
                sizes="(min-width: 768px) 22vw, 45vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <p className="mt-2 font-serif text-lg text-primary group-hover:underline">{s.name}</p>
            <p className="text-xs text-muted">{s.season}</p>
          </Link>
        </li>
      ))}
    </ul>
  ),
  SectionsList: () => (
    <ol className="!my-10 divide-y divide-line border-y border-line">
      {getSections().map((s) => (
        <li key={s.slug} data-reveal>
          <Link
            href={`/academics/${s.slug}`}
            className="group grid gap-1 py-5 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline sm:gap-6"
          >
            <span className="font-serif text-2xl text-primary group-hover:text-kiln-700">{s.name}</span>
            <span className="text-muted">
              Ages {s.ages} · {s.years} · {s.stage}
            </span>
            <span aria-hidden className="text-kiln-700 transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </li>
      ))}
    </ol>
  ),
  Recognition: () => (
    <ul className="!my-10 grid gap-4 sm:grid-cols-2">
      {getRecognition().map((r) => (
        <li key={r.title} data-reveal className="rounded-lg border border-line bg-elevated p-6">
          <p className="font-serif text-4xl text-marigold-700">{r.year}</p>
          <p className="mt-2 font-serif text-xl text-primary">{r.title}</p>
          <p className="mt-1 text-sm text-muted">{r.detail}</p>
          <p className="mt-3 text-xs tracking-wide text-muted uppercase">{r.by}</p>
        </li>
      ))}
    </ul>
  ),
};

export async function renderMdx(source: string) {
  const { content } = await compileMDX({
    source,
    components,
    options: { parseFrontmatter: false, blockJS: false },
  });
  return content;
}
