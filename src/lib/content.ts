import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import readingTime from "reading-time";
import sectionsJson from "@content/sections.json";
import sportsJson from "@content/sports.json";
import facultyJson from "@content/faculty.json";
import eventsJson from "@content/events.json";
import announcementsJson from "@content/announcements.json";
import testimonialsJson from "@content/testimonials.json";
import recognitionJson from "@content/recognition.json";
import resourcesJson from "@content/resources.json";
import tourJson from "@content/tour.json";
import imagesJson from "@content/images.manifest.json";

/**
 * Content layer. Pages and posts are MDX files in /content; structured data is JSON.
 * Everything public reads through these functions, so a headless CMS (Sanity, Contentful, Strapi…) can
 * replace the file reads later without touching components.
 */
const CONTENT = path.join(process.cwd(), "content");

export type Section = (typeof sectionsJson)[number];
export type Sport = (typeof sportsJson)[number];
export type FacultyMember = (typeof facultyJson)[number];
export type Testimonial = (typeof testimonialsJson)[number];
export type Recognition = (typeof recognitionJson)[number];
export type Resource = (typeof resourcesJson)[number] & { href?: string };
export type TourData = typeof tourJson;

export type PublicEvent = {
  slug: string;
  title: string;
  kind: string;
  summary: string;
  description?: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  showInModal: boolean;
};

export type PageFrontmatter = {
  title: string;
  description: string;
  eyebrow?: string;
  image?: string;
  layout?: "editorial" | "letter" | "profile" | "legal";
  signature?: string;
  portrait?: string;
  related?: string[];
  updated?: string;
};

export type Page = { slug: string; frontmatter: PageFrontmatter; body: string };

export type PostFrontmatter = {
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  image: string;
  imageAlt: string;
};
export type Post = { slug: string; frontmatter: PostFrontmatter; body: string; readingMinutes: number };

// ── Pages ──────────────────────────────────────────────────────────

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return files.flat();
}

export const getPageSlugs = cache(async (): Promise<string[]> => {
  const root = path.join(CONTENT, "pages");
  return (await walk(root))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) =>
      path
        .relative(root, f)
        .replace(/\.mdx$/, "")
        .split(path.sep)
        .join("/"),
    );
});

export const getPage = cache(async (slug: string): Promise<Page | null> => {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug)) return null;
  try {
    const raw = await readFile(path.join(CONTENT, "pages", `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    if (data.updated instanceof Date) data.updated = data.updated.toISOString().slice(0, 10);
    return { slug, frontmatter: data as PageFrontmatter, body: content };
  } catch {
    return null;
  }
});

// ── Blog ───────────────────────────────────────────────────────────

export const getPosts = cache(async (): Promise<Post[]> => {
  const dir = path.join(CONTENT, "blog");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".mdx"));
  const posts = await Promise.all(
    files.map(async (f) => {
      const { data, content } = matter(await readFile(path.join(dir, f), "utf8"));
      const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);
      return {
        slug: f.replace(/\.mdx$/, ""),
        frontmatter: { ...data, date } as PostFrontmatter,
        body: content,
        readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
      };
    }),
  );
  return posts.sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
});

export async function getPost(slug: string): Promise<Post | null> {
  return (await getPosts()).find((p) => p.slug === slug) ?? null;
}

export async function getRelatedPosts(post: Post, limit = 3): Promise<Post[]> {
  const all = (await getPosts()).filter((p) => p.slug !== post.slug);
  const score = (p: Post) => p.frontmatter.tags.filter((t) => post.frontmatter.tags.includes(t)).length;
  return all.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export async function getTags(): Promise<{ tag: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const p of await getPosts())
    for (const t of p.frontmatter.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

// ── Structured content ─────────────────────────────────────────────

export const getSections = (): Section[] => sectionsJson;
export const getSection = (slug: string) => sectionsJson.find((s) => s.slug === slug) ?? null;
export const getSports = (): Sport[] => sportsJson;
export const getSport = (slug: string) => sportsJson.find((s) => s.slug === slug) ?? null;
export const getFaculty = (): FacultyMember[] => facultyJson;
export const getFacultyMember = (slug: string) => facultyJson.find((f) => f.slug === slug) ?? null;
export const getTestimonials = (): Testimonial[] => testimonialsJson;
export const getRecognition = (): Recognition[] => recognitionJson;
export const getResources = (): Resource[] => resourcesJson as Resource[];
export const getTour = (): TourData => tourJson;

type ImageSlot = (typeof imagesJson.slots)[number];
const imageByPath = new Map(imagesJson.slots.map((s) => [s.localPath, s] as const));
/** Alt text for a local image, from the manifest. */
export function altFor(src: string, fallback = ""): string {
  return imageByPath.get(src)?.alt ?? fallback;
}
export const getImageSlots = (): ImageSlot[] => imagesJson.slots;

// ── DB-backed with JSON fallback (editable in the CRM content module) ──

export const getEvents = cache(async (): Promise<PublicEvent[]> => {
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.event.findMany({ where: { published: true }, orderBy: { startsAt: "asc" } });
    // The database is the source of truth once reachable: no published events means none, not the JSON seed
    return rows.map((e) => ({ ...e, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString() }));
  } catch {
    /* database unreachable: fall back to the JSON seed */
  }
  return eventsJson;
});

export async function getUpcomingEvents(now = new Date()): Promise<PublicEvent[]> {
  return (await getEvents()).filter((e) => new Date(e.endsAt) >= now);
}

export async function getModalEvent(now = new Date()): Promise<PublicEvent | null> {
  return (await getUpcomingEvents(now)).find((e) => e.showInModal) ?? null;
}

export type BarItem = { title: string; body: string; href?: string | null };

export const getAnnouncementBar = cache(async (): Promise<BarItem[]> => {
  try {
    const { db } = await import("@/lib/db");
    const now = new Date();
    const rows = await db.announcement.findMany({
      where: {
        kind: "BAR",
        active: true,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ order: "asc" }, { publishedAt: "desc" }],
    });
    return rows; // switching every item off in the CRM hides the bar
  } catch {
    /* fall back */
  }
  return announcementsJson;
});
