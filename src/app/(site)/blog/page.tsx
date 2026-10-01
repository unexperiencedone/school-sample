import Link from "next/link";
import { PageHero } from "@/components/site/blocks";
import { PostCard } from "@/components/site/post-card";
import { getPosts, getTags } from "@/lib/content";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Blog — Life on the hill",
  description: "Stories from classrooms, boarding houses, playing fields and the kitchen garden.",
  path: "/blog",
  image: "/images/blog.webp",
});

export default async function BlogIndex() {
  const [posts, tags] = await Promise.all([getPosts(), getTags()]);
  const [first, ...rest] = posts;
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Life on the hill"
        intro="Stories from classrooms, boarding houses, playing fields and the kitchen garden. All posts are original sample content."
        image="/images/blog.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
        ]}
      />
      <section className="container-site py-16">
        <nav aria-label="Tags" className="mb-12 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={`/blog/tag/${t.tag}`}
              className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm hover:bg-cream"
            >
              {t.tag.replace(/-/g, " ")} <span className="text-muted">({t.count})</span>
            </Link>
          ))}
        </nav>
        {first && (
          <div data-reveal className="mb-16">
            <PostCard post={first} large />
          </div>
        )}
        <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <li key={p.slug} data-reveal>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
