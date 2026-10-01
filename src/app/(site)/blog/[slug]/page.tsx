import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, CtaBand } from "@/components/site/blocks";
import { PostCard } from "@/components/site/post-card";
import { JsonLd, breadcrumbJsonLd } from "@/components/site/json-ld";
import { renderMdx } from "@/components/site/mdx";
import { getPost, getPosts, getRelatedPosts } from "@/lib/content";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";
import { school, siteUrl } from "@/config/school";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export async function generateStaticParams() {
  return (await getPosts()).map((p) => ({ slug: p.slug }));
}
export async function generateMetadata({ params }: Props) {
  const p = await getPost((await params).slug);
  return p
    ? pageMetadata({
        title: p.frontmatter.title,
        description: p.frontmatter.description,
        path: `/blog/${p.slug}`,
        image: p.frontmatter.image,
        type: "article",
      })
    : {};
}

export default async function PostPage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const fm = post.frontmatter;
  const [body, related] = await Promise.all([renderMdx(post.body), getRelatedPosts(post)]);
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Blog", href: "/blog" },
    { name: fm.title, href: `/blog/${post.slug}` },
  ];
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: fm.title,
            description: fm.description,
            datePublished: fm.date,
            image: `${siteUrl()}${fm.image}`,
            author: { "@type": "Organization", name: fm.author },
            publisher: {
              "@type": "Organization",
              name: school.name,
              logo: { "@type": "ImageObject", url: `${siteUrl()}/favicon.svg` },
            },
            mainEntityOfPage: `${siteUrl()}/blog/${post.slug}`,
          },
        ]}
      />
      <article>
        <header className="container-prose pt-10 pb-10">
          <Breadcrumb items={crumbs} />
          <p className="mt-10 text-xs tracking-wider text-kiln-700 uppercase">
            <time dateTime={fm.date}>{formatDate(fm.date, "d MMMM yyyy")}</time> · {post.readingMinutes} min
            read · {fm.author}
          </p>
          <h1 className="t-h1 mt-3 text-primary">{fm.title}</h1>
          <p className="t-lead mt-5">{fm.description}</p>
        </header>
        <div className="container-site">
          <div className="relative aspect-[21/9] overflow-hidden rounded-lg">
            <Image src={fm.image} alt={fm.imageAlt} fill priority sizes="100vw" className="object-cover" />
          </div>
        </div>
        <div className="container-prose prose-school py-14">{body}</div>
        <footer className="container-prose flex flex-wrap gap-2 pb-16">
          {fm.tags.map((t) => (
            <Link
              key={t}
              href={`/blog/tag/${t}`}
              className="rounded-full bg-cream px-3 py-1 text-sm hover:bg-sand"
            >
              #{t}
            </Link>
          ))}
        </footer>
      </article>
      <section aria-labelledby="related" className="border-t border-line bg-cream/50 py-16">
        <div className="container-site">
          <h2 id="related" className="t-h2 text-primary">
            Related stories
          </h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3">
            {related.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand title="See it for yourself" primary={{ label: "Book a visit", href: "/book-a-tour" }} />
    </>
  );
}
