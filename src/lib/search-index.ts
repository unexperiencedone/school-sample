import "server-only";
import { allStaticLinks } from "@/config/nav";
import {
  getFaculty,
  getPage,
  getPageSlugs,
  getPosts,
  getSections,
  getSports,
  getUpcomingEvents,
} from "@/lib/content";

export type SearchDoc = { title: string; href: string; type: string; text: string };

/** Builds the public search index (pages, sections, sports, faculty, posts, events, vacancies). */
export async function buildSearchIndex(): Promise<SearchDoc[]> {
  const docs: SearchDoc[] = [];
  const strip = (s: string) =>
    s
      .replace(/<[^>]+>|\{[^}]*\}|[#*_>`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
  for (const slug of await getPageSlugs()) {
    const p = await getPage(slug);
    if (p)
      docs.push({
        title: p.frontmatter.title,
        href: `/${slug}`,
        type: p.frontmatter.eyebrow ?? "Page",
        text: `${p.frontmatter.description} ${strip(p.body)}`,
      });
  }
  for (const s of getSections())
    docs.push({
      title: `${s.name} (ages ${s.ages})`,
      href: `/academics/${s.slug}`,
      type: "Academics",
      text: `${s.tagline} ${s.intro} ${s.subjects.join(" ")}`,
    });
  for (const s of getSports())
    docs.push({ title: s.name, href: `/sports/${s.slug}`, type: "Sport", text: `${s.summary} ${s.body}` });
  for (const f of getFaculty())
    docs.push({
      title: f.name,
      href: `/faculty/${f.slug}`,
      type: "Faculty",
      text: `${f.role} ${f.department} ${f.bio}`,
    });
  for (const p of await getPosts())
    docs.push({
      title: p.frontmatter.title,
      href: `/blog/${p.slug}`,
      type: "Blog",
      text: `${p.frontmatter.description} ${p.frontmatter.tags.join(" ")} ${strip(p.body)}`,
    });
  for (const e of await getUpcomingEvents())
    docs.push({
      title: e.title,
      href: `/events#${e.slug}`,
      type: "Event",
      text: `${e.summary} ${e.location}`,
    });
  try {
    const { db } = await import("@/lib/db");
    for (const v of await db.vacancy.findMany({ where: { status: "OPEN" } }))
      docs.push({
        title: v.title,
        href: `/careers/vacancies/${v.slug}`,
        type: "Vacancy",
        text: `${v.department} ${v.summary}`,
      });
  } catch {
    /* no db */
  }
  const seen = new Set(docs.map((d) => d.href));
  for (const l of allStaticLinks())
    if (!seen.has(l.href)) docs.push({ title: l.label, href: l.href, type: "Page", text: l.blurb ?? "" });
  return docs;
}
