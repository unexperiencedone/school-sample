# Content guide

All public content lives in `content/` and is read through **`src/lib/content.ts`** — the only module that knows where content comes from. To move to a headless CMS later, re-implement those functions; components don't change.

## Where things are

| Content                                                                                | Location                                    | Format            | Notes                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| Generic pages (About, Boarding, Programmes, Campus, Careers sub-pages, Privacy, Terms) | `content/pages/**.mdx`                      | MDX + frontmatter | Path = URL. `content/pages/about/welcome.mdx` → `/about/welcome` |
| Blog posts                                                                             | `content/blog/*.mdx`                        | MDX + frontmatter | Reading time computed automatically                              |
| School sections (Pre-Prep … Sixth Form)                                                | `content/sections.json`                     | JSON              | Rendered by `/academics/[section]`                               |
| Sport / co-curricular (12)                                                             | `content/sports.json`                       | JSON              | Rendered by `/sports/[slug]`                                     |
| Faculty                                                                                | `content/faculty.json`                      | JSON              | Fictional people, illustrated portraits                          |
| Events / Open House modal                                                              | `content/events.json` → **database**        | JSON seed         | Edit in CRM › Content › Events (`showInModal`)                   |
| Announcement bar                                                                       | `content/announcements.json` → **database** | JSON seed         | Edit in CRM › Content                                            |
| Vacancies                                                                              | `content/vacancies.json` → **database**     | JSON seed         | Edit in CRM › Careers                                            |
| Testimonials, recognition, resources, 360° tour                                        | `content/*.json`                            | JSON              |                                                                  |
| Image slots                                                                            | `content/images.manifest.json`              | JSON              | See "Images"                                                     |

Events, announcements and vacancies are seeded from JSON but owned by the database afterwards so staff can edit them; if the database is unreachable the site falls back to the JSON.

## Page frontmatter

```yaml
---
title: Full boarding # h1 + <title>
description: One sentence. # meta description + hero intro
eyebrow: Boarding # small label above the h1
image: /images/boarding-full.webp
layout: editorial # editorial | letter | profile | legal
related: [/boarding/flexi, /boarding/day]
updated: 2026-09-01 # legal pages
---
```

## MDX components

Use these inside any page or post:

| Component                                                              | Example                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `<Lead>`                                                               | Large intro paragraph                                    |
| `<Pull by="…">`                                                        | Pull quote                                               |
| `<Note>`                                                               | Marigold info box (use for "sample content" disclaimers) |
| `<Values items={[{name,text}]} />`                                     | Numbered values grid                                     |
| `<Stats items={[{value,label}]} />`                                    | Stat strip                                               |
| `<Timeline items={[{year,title,text}]} />`                             | Vertical timeline                                        |
| `<Cards items={[{title,text}]} />`                                     | Card grid                                                |
| `<Split image="/images/…" title="…">…</Split>`                         | Image + text                                             |
| `<Gallery />`, `<SportsGrid />`, `<SectionsList />`, `<Recognition />` | Data-driven blocks                                       |

## Writing rules

- Everything is **original** and about a **fictional** school. Never reuse a real school's wording, names, figures or awards.
- Mark sample people, figures and partners as samples (`<Note>` or "(sample)").
- Contact details stay obviously fake (`+91 00000 00000`, `*@aurelia-sample.test`).
- British spelling, warm and plain. Sentence case headings.

## Images

1. Every image used on the site has a **slot** in `content/images.manifest.json` (`slot, query, orientation, minWidth, alt, credit, localPath`).
2. `pnpm images:fetch` fills slots from **Unsplash** (`UNSPLASH_ACCESS_KEY`, free at <https://unsplash.com/developers>) or **Pexels** (`PEXELS_API_KEY`, free at <https://www.pexels.com/api/>) via their official APIs, resizes with `sharp`, writes WebP to `public/images/` and records the photographer credit. Unsplash download tracking is honoured.
3. With no keys, designed SVG placeholders are generated per slot (arches, landscapes, interiors, sport, illustrated portraits, panoramas, map) and the script lists slots that still need photos.
4. `pnpm credits` regenerates `docs/CREDITS.md`; `/credits` renders the same data.
5. Choose photos without identifiable minors' faces where possible (backs, hands, details, architecture). Portraits of staff are illustrations.
6. **Hero video:** stills for building it live in `public/herovideo/` (slots `herovideo-01…08`, 1920×1080 JPEG). Drop `hero.mp4` (+ optional `hero-mobile.mp4`) into that folder and the home hero uses it automatically. See `public/herovideo/README.md` for an ffmpeg recipe.
7. **360° tour:** replace `public/images/pano-*.webp` with 2:1 equirectangular captures; scenes and hotspot positions are in `content/tour.json`.

## URL rules and redirects

- Lowercase, hyphenated, stable slugs; sections are folders (`/admissions/fees/full-boarding`).
- Aliases and legacy-style URLs 301 to the canonical slug — the map is `src/config/redirects.ts` (e.g. `/fees`, `/apply`, `/about-us`, `/facilities/:slug`, `/jobs`).
- Navigation, footer, sitemap, breadcrumbs and search are all driven by `src/config/nav.ts`; add a page there and it appears everywhere.

## SEO

Per-page metadata via `pageMetadata()` (canonical, Open Graph, Twitter). JSON-LD: `School`/`Organization` (every page), `BreadcrumbList`, `Event`, `Article`, `JobPosting`, `FAQPage`. `sitemap.xml` and `robots.txt` are generated; private areas (`/admin`, `/portal`, `/applicant`, `/login`, `/mock-pay`, forms) are `noindex` and disallowed.
