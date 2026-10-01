import Image from "next/image";
import Link from "next/link";
import type { Post } from "@/lib/content";
import { formatDate } from "@/lib/dates";

export function PostCard({ post, large }: { post: Post; large?: boolean }) {
  const fm = post.frontmatter;
  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <div className={`relative overflow-hidden rounded-lg ${large ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        <Image
          src={fm.image}
          alt={fm.imageAlt}
          fill
          sizes={large ? "(min-width: 1024px) 60vw, 100vw" : "(min-width: 1024px) 30vw, 100vw"}
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <p className="mt-4 text-xs tracking-wider text-kiln-700 uppercase">
        <time dateTime={fm.date}>{formatDate(fm.date)}</time> · {post.readingMinutes} min read
      </p>
      <h3
        className={`mt-1 font-serif leading-snug text-primary group-hover:underline ${large ? "text-3xl" : "text-xl"}`}
      >
        {fm.title}
      </h3>
      <p className="mt-2 text-sm text-muted">{fm.description}</p>
    </Link>
  );
}
