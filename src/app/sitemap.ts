import type { MetadataRoute } from "next";
import { allStaticLinks } from "@/config/nav";
import { getFaculty, getPageSlugs, getPosts, getSections, getSports, getTags } from "@/lib/content";
import { siteUrl } from "@/config/school";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const urls = new Set<string>(allStaticLinks().map((l) => l.href));
  for (const s of await getPageSlugs()) urls.add(`/${s}`);
  for (const s of getSections()) urls.add(`/academics/${s.slug}`);
  for (const s of getSports()) urls.add(`/sports/${s.slug}`);
  for (const f of getFaculty()) urls.add(`/faculty/${f.slug}`);
  for (const t of await getTags()) urls.add(`/blog/tag/${t.tag}`);
  const posts = await getPosts();
  for (const p of posts) urls.add(`/blog/${p.slug}`);
  try {
    const { db } = await import("@/lib/db");
    for (const v of await db.vacancy.findMany({ where: { status: "OPEN" }, select: { slug: true } }))
      urls.add(`/careers/vacancies/${v.slug}`);
  } catch {
    /* no db at build */
  }
  ["/search", "/admissions/register", "/careers/apply"].forEach((u) => urls.delete(u));
  return [...urls].map((u) => ({
    url: `${base}${u}`,
    changeFrequency: u.startsWith("/blog") || u === "/events" ? "weekly" : "monthly",
    priority: u === "/" ? 1 : u.startsWith("/admissions") ? 0.9 : 0.6,
  }));
}
