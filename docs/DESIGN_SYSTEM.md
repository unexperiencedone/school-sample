# Design system

Living version: **`/_design`** (renders the tokens, type scale, controls and states from the real CSS).

## Identity

Aurelia Hall is a fictional school; its identity is original and deliberately unlike typical "school blue".

- **Idea.** An arched doorway (_the Hall_) framing a rising sun (_Aurelia_, golden). The arch is the recurring motif: logo, image masks (`.arch`, `.arch-sm`), section ornaments, the 404 page.
- **Voice.** Warm, confident, scholarly. Editorial rhythm: big serif headlines, generous white space, quiet details.
- **Wordmark.** `src/components/brand/logo.tsx` — pure SVG mark + live-text wordmark, so it recolours with `currentColor` and renames with `school.ts`.

## Colour tokens (`src/styles/tokens.css`)

| Role           | Token               | Value                 | Use                                               |
| -------------- | ------------------- | --------------------- | ------------------------------------------------- |
| Brand 1        | `--damson-800`      | `#3d1d38`             | Primary buttons, headlines, dark bands            |
| Brand 1 (deep) | `--damson-900/950`  | `#2a1227` / `#1c0b1a` | Footer, announcement bar, hero overlays           |
| Brand 2        | `--kiln-700`        | `#8f3f26`             | Eyebrows, small accents, links in body copy       |
| Accent         | `--marigold-500`    | `#e3a72f`             | CTAs on dark, focus ring base, bullets, rules     |
| Accent text    | `--marigold-700`    | `#9a6408`             | Gold text on light backgrounds (≥ 4.5:1 on paper) |
| Accent ink     | `--marigold-800`    | `#7a4f06`             | Gold text on marigold-100 tints (6.2:1)           |
| Paper          | `--paper`           | `#fbf7f0`             | Page background                                   |
| Cream / sand   | `--cream`, `--sand` | `#f4ece0`, `#e7ddd0`  | Sunken surfaces, rules                            |
| Ink / slate    | `--ink`, `--slate`  | `#231a21`, `#66555f`  | Body text, muted text (6.5:1 on paper)            |

Components use **semantic roles** (`--bg`, `--fg`, `--fg-muted`, `--primary`, `--accent`, `--line`, `--success` …), exposed as Tailwind colours (`bg-bg`, `text-muted`, `border-line` …). The CRM's dark mode redefines the same roles under `[data-theme="dark"]`, so one component library serves both.

Contrast rules learned the hard way (axe-verified): marigold-500/600 are for fills and decoration only; use `text-marigold-700` for gold text on paper or white, `text-marigold-800` on marigold-100 tints (badges, callouts — 700 only reaches 4.38:1 there), and `text-marigold-300` on damson.

## Type

| Face                          | Use                              | Files                                |
| ----------------------------- | -------------------------------- | ------------------------------------ |
| **Fraunces** (variable, opsz) | Headlines, numerals, pull quotes | `public/fonts/fraunces-opsz*.woff2`  |
| **Hanken Grotesk** (variable) | Body, UI, CRM                    | `public/fonts/hanken-grotesk*.woff2` |

Self-hosted Latin subsets (SIL OFL). Only the two upright files are preloaded; italics load on demand. Metric-adjusted local fallbacks (`Fraunces Fallback`, `Hanken Fallback`) keep layout shift at ~0.

Scale (`globals.css`): `.t-display` (clamp 2.6→5.4rem), `.t-h1`, `.t-h2`, `.t-h3`, `.t-lead`, `.t-eyebrow` (0.75rem, 0.16em tracking, uppercase, kiln). Long-form copy uses `.prose-school` (17px / 1.75).

## Layout & rhythm

- `container-site` (82rem max, fluid gutters) and `container-prose` (44rem).
- Sections alternate rhythm on purpose: asymmetric 0.9/1.1 splits, full-bleed dark bands, arched card grids, horizontal scroll rows, ruled lists. Avoid repeating "hero + three cards".
- Inner pages use `PageHero` (text left, arched image right); the home hero is full-bleed.

## Components (build once, reuse)

| Component                                                                                                     | File                                                |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Header + accessible mega-menu, mobile drawer (code-split)                                                     | `components/site/header.tsx`, `mobile-menu.tsx`     |
| Announcement bar (rotating, pausable)                                                                         | `components/site/announcement-bar.tsx`              |
| Home hero (art-directed image, optional video, Ken Burns)                                                     | `components/site/hero.tsx`, `hero-video.tsx`        |
| PageHero, SectionHeader, SplitFeature, StatStrip, CardGrid, Timeline, CtaBand, Breadcrumb                     | `components/site/blocks.tsx`                        |
| Quote slider, scroll row, gallery + lightbox                                                                  | `quote-slider.tsx`, `scroll-row.tsx`, `gallery.tsx` |
| Accordion, Tabs, Dialog/Sheet, Button, Badge, Field/Input/Select/Textarea, Table, Skeleton/Empty/Error states | `components/ui/*`                                   |
| Enquiry drawer, Open House modal, WhatsApp button, cookie consent                                             | `components/site/*`                                 |
| CRM shell, sidebar, command search, page header                                                               | `components/crm/*`                                  |

## Motion

- Scroll reveal: `[data-reveal]` + `RevealObserver` (IntersectionObserver). Content is visible without JS.
- Route transition: `.route-enter`, **only after client-side navigation** (never on first load, where it would delay LCP).
- Ken Burns on the hero still when no video is present.
- Everything is disabled under `prefers-reduced-motion: reduce`. Carousels auto-advance only without reduced motion and have pause controls.

## Accessibility checklist (WCAG 2.2 AA)

- Skip link, landmarks, one `h1` per page, sequential headings (checked in e2e).
- Focus ring: 3px marigold outline with offset on every interactive element.
- Mega-menu: disclosure buttons with `aria-expanded`, ←/→ between top items, ↓ into panel, Esc returns focus.
- Dialogs: Radix (focus trap, Esc, labelled title/description).
- Forms: visible labels, `aria-invalid` + `aria-describedby` errors, `role="alert"` messages, DOB as three labelled selects.
- Target size ≥ 24px (carousel dots and footer links were fixed for 2.5.8).
- Logo links: visible wordmark is `aria-hidden`; the accessible name comes from screen-reader text that matches it (2.5.3).
- axe (wcag2a/aa, 21a/aa, 22aa) runs in `tests/e2e/public-site.spec.ts` with zero serious/critical issues required.

## Performance budget

- Home first-load JS ≈ 125 kB; dialogs, forms and the 360° viewer are code-split.
- LCP image is a single art-directed `<picture>` (phones get the portrait crop only), `fetchpriority="high"`.
- Lighthouse (mobile, local production build): home 92 / 100 / 100 / 100, About › Welcome 94 / 100 / 100 / 100 (perf / a11y / best practices / SEO).

## Charts (CRM dashboard)

Components live in `src/components/charts` (`ChartCard`, `BarList`, `ColumnChart`, `SeatMeters`, `StatTile`, `Meter`).

- **Form first.** Headline numbers are stat tiles (sans, proportional figures, delta with an arrow icon and words).
  Ranked categories are horizontal bars. Change over time uses columns. Capacity uses stacked meters.
- **Colour by job.**
  - **Categorical:** `--viz-1` damson `#86407a` and `--viz-2` marigold `#c9850c` (dark mode: `#a95b9b` and `#c08010`).
  - **Ordinal** (application stages, darker = further along): `--viz-ord-1…7`, a single damson hue. In dark mode the anchor flips, so early stages sit nearest the surface.
  - **Status colours** keep their own tokens and always come with an icon and a label.
- **Validated, not eyeballed.**
  - Categorical slots pass the lightness band, the chroma floor (≥ 0.10), colour-blind separation (deutan/protan ΔE ≈ 27 light, 19.5 dark), the normal-vision floor and 3:1 contrast against the card surface (`#ffffff` light, `#211923` dark).
  - The ordinal ramp is monotone, with ≥ 0.06 ΔL per step and a light end ≥ 2:1.
- **Marks.**
  - Bars ≤ 24px thick, square at the baseline with a 4px rounded data end.
  - Hairline gridlines and a solid baseline.
  - A 2px surface gap between stacked segments.
  - One direct label (the peak); every other value is in the tooltip and the table.
- **Text never wears series colour.** Values, labels and legends use ink tokens; swatches carry identity.
- **Interaction.**
  - Each mark is a hover/focus target larger than the mark itself, with a tooltip.
  - Each card has a Chart/Table toggle (`aria-pressed`).
  - Phones drop every other axis label on dense time axes.
- **No dual axes.**

## CRM density

The CRM reuses the tokens with a denser scale: 14px body, 32–36px controls, sticky table headers, dark mode toggle, keyboard search (`/` or ⌘K).
