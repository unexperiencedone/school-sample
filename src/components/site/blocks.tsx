import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnquireButton } from "./enquiry-context";

/** Eyebrow + serif headline + optional intro. `align="split"` puts the intro beside the headline. */
export function SectionHeader({
  eyebrow,
  title,
  intro,
  align = "left",
  className,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center" | "split";
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div
      data-reveal
      className={cn(
        align === "center" && "mx-auto max-w-2xl text-center",
        align === "split" && "grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end",
        className,
      )}
    >
      <div>
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <Tag className={cn(Tag === "h1" ? "t-h1" : "t-h2", "mt-3 text-primary")}>{title}</Tag>
      </div>
      {intro && (
        <div className={cn("t-lead", align !== "split" && "mt-4 max-w-2xl", align === "center" && "mx-auto")}>
          {intro}
        </div>
      )}
    </div>
  );
}

export function SplitFeature({
  image,
  alt,
  eyebrow,
  title,
  children,
  reverse,
  cta,
  shape = "arch",
}: {
  image: string;
  alt: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  reverse?: boolean;
  cta?: { label: string; href: string };
  shape?: "arch" | "rect";
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <div
        data-reveal
        className={cn(
          "relative aspect-[4/5] overflow-hidden sm:aspect-[5/4] lg:aspect-[4/5]",
          shape === "arch" ? "arch" : "rounded-lg",
          reverse && "lg:order-2",
        )}
      >
        <Image src={image} alt={alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
      </div>
      <div data-reveal style={{ ["--reveal-delay" as string]: "120ms" }}>
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <h3 className="t-h2 mt-3 text-primary">{title}</h3>
        <div className="mt-5 space-y-4 text-[1.05rem] leading-relaxed text-muted">{children}</div>
        {cta && (
          <Link
            href={cta.href}
            className="mt-7 inline-flex items-center gap-2 font-medium text-damson-800 underline decoration-marigold-500 decoration-2 underline-offset-[6px] hover:decoration-damson-800"
          >
            {cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

export function StatStrip({
  items,
  tone = "light",
}: {
  items: { value: string; label: string }[];
  tone?: "light" | "dark";
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-y-8 border-y py-8 md:grid-cols-4",
        tone === "dark" ? "border-damson-700" : "border-line",
      )}
    >
      {items.map((s, i) => (
        <div
          key={s.label}
          data-reveal
          style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
          className={cn(
            "px-4",
            i > 0 && "md:border-l",
            tone === "dark" ? "md:border-damson-700" : "md:border-line",
          )}
        >
          <dt className="sr-only">{s.label}</dt>
          <dd
            className={cn(
              "font-serif text-4xl tracking-tight md:text-5xl",
              tone === "dark" ? "text-marigold-300" : "text-damson-800",
            )}
          >
            {s.value}
          </dd>
          <dd className={cn("mt-1 text-sm", tone === "dark" ? "text-damson-300" : "text-muted")}>
            {s.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CardGrid({
  items,
  columns = 3,
}: {
  items: { title: string; text: string; href?: string; image?: string; meta?: string }[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <ul
      className={cn(
        "grid gap-5 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
      )}
    >
      {items.map((c, i) => {
        const inner = (
          <>
            {c.image && (
              <div className="relative -mx-6 -mt-6 mb-5 aspect-[16/10] overflow-hidden rounded-t-lg">
                <Image
                  src={c.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            )}
            {c.meta && (
              <p className="mb-2 text-xs font-semibold tracking-wider text-kiln-700 uppercase">{c.meta}</p>
            )}
            <h3 className="font-serif text-xl text-primary">{c.title}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{c.text}</p>
            {c.href && (
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-damson-800">
                Read more{" "}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            )}
          </>
        );
        return (
          <li key={c.title} data-reveal style={{ ["--reveal-delay" as string]: `${(i % 3) * 80}ms` }}>
            {c.href ? (
              <Link
                href={c.href}
                className="group block h-full rounded-lg border border-line bg-elevated p-6 transition-shadow hover:shadow-lift"
              >
                {inner}
              </Link>
            ) : (
              <div className="group h-full rounded-lg border border-line bg-elevated p-6">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Timeline({ items }: { items: { year: string; title: string; text: string }[] }) {
  return (
    <ol className="relative my-10 border-l-2 border-marigold-300 pl-8">
      {items.map((it, i) => (
        <li
          key={it.year + it.title}
          data-reveal
          style={{ ["--reveal-delay" as string]: `${i * 60}ms` }}
          className="relative pb-9 last:pb-0"
        >
          <span
            className="absolute top-1 -left-[2.65rem] grid size-5 place-items-center rounded-full border-2 border-marigold-500 bg-paper"
            aria-hidden
          >
            <span className="size-1.5 rounded-full bg-kiln-700" />
          </span>
          <p className="font-serif text-lg text-kiln-700">{it.year}</p>
          <h3 className="mt-0.5 font-sans text-base font-semibold text-fg">{it.title}</h3>
          <p className="mt-1 text-[0.95rem] text-muted">{it.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function CtaBand({
  title,
  text,
  primary,
  secondary,
}: {
  title: string;
  text?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="grain relative overflow-hidden bg-damson-800 text-paper">
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-96 text-damson-700"
        viewBox="0 0 48 56"
      >
        <path
          d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
      <div className="container-site relative flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center">
        <div data-reveal className="max-w-xl">
          <h2 className="t-h2">{title}</h2>
          {text && <p className="mt-3 text-damson-100">{text}</p>}
        </div>
        <div data-reveal className="flex flex-wrap gap-3">
          {primary ? (
            <Link
              href={primary.href}
              className="rounded-full bg-marigold-500 px-6 py-3.5 font-semibold text-damson-950 hover:bg-marigold-300"
            >
              {primary.label}
            </Link>
          ) : (
            <EnquireButton className="rounded-full bg-marigold-500 px-6 py-3.5 font-semibold text-damson-950 hover:bg-marigold-300">
              Enquire now
            </EnquireButton>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="rounded-full border border-damson-300/60 px-6 py-3.5 font-semibold hover:bg-damson-700"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function Breadcrumb({ items }: { items: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-muted">
        {items.map((it, i) => (
          <li key={it.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-fg">
                {it.name}
              </span>
            ) : (
              <Link href={it.href} className="hover:text-fg hover:underline">
                {it.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Inner-page hero: text left, arched image right — different rhythm from the full-bleed home hero. */
export function PageHero({
  eyebrow,
  title,
  intro,
  image,
  alt,
  crumbs,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  image?: string;
  alt?: string;
  crumbs: { name: string; href: string }[];
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-cream/60">
      <div className="container-site grid items-end gap-10 pt-8 pb-12 lg:grid-cols-[1.25fr_1fr] lg:pt-12 lg:pb-16">
        <div>
          <Breadcrumb items={crumbs} />
          {eyebrow && <p className="t-eyebrow mt-8">{eyebrow}</p>}
          <h1 className="t-h1 mt-3 max-w-3xl text-primary">{title}</h1>
          {intro && <p className="t-lead mt-5 max-w-2xl">{intro}</p>}
          {children}
        </div>
        {image && (
          <div className="arch relative hidden aspect-[4/5] max-h-[440px] w-full justify-self-end lg:block lg:max-w-sm">
            <Image
              src={image}
              alt={alt ?? ""}
              fill
              priority
              fetchPriority="high"
              sizes="(min-width: 1024px) 30vw, 0px"
              className="object-cover"
            />
          </div>
        )}
      </div>
    </section>
  );
}
