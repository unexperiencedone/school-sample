import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/blocks";
import { PostCard } from "@/components/site/post-card";
import { getPosts, getTags } from "@/lib/content";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ tag: string }> };
export const dynamicParams = false;
export async function generateStaticParams() {
  return (await getTags()).map((t) => ({ tag: t.tag }));
}
export async function generateMetadata({ params }: Props) {
  const { tag } = await params;
  return pageMetadata({
    title: `Posts tagged “${tag.replace(/-/g, " ")}”`,
    description: `Blog posts about ${tag.replace(/-/g, " ")}.`,
    path: `/blog/tag/${tag}`,
  });
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const posts = (await getPosts()).filter((p) => p.frontmatter.tags.includes(tag));
  if (!posts.length) notFound();
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title={`“${tag.replace(/-/g, " ")}”`}
        intro={`${posts.length} post${posts.length > 1 ? "s" : ""}`}
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: tag, href: `/blog/tag/${tag}` },
        ]}
      />
      <ul className="container-site grid gap-x-8 gap-y-14 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <li key={p.slug}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
    </>
  );
}
