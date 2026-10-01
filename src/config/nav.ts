/**
 * Public information architecture. Drives the mega-menu, mobile drawer, footer, sitemap,
 * breadcrumbs and the search index. Slugs are lowercase and hyphenated; aliases live in redirects.ts.
 */
export type NavLink = { label: string; href: string; blurb?: string };
export type NavGroup = {
  label: string;
  href: string;
  intro: string;
  links: NavLink[];
  feature?: { title: string; href: string; image: string; caption: string };
};

export const mainNav: NavGroup[] = [
  {
    label: "About",
    href: "/about/welcome",
    intro: "Who we are, what we believe, and the people who make Aurelia Hall.",
    links: [
      { label: "Welcome", href: "/about/welcome", blurb: "A letter from the Head" },
      { label: "Mission & vision", href: "/about/mission-and-vision" },
      { label: "Our story", href: "/about/our-story" },
      { label: "Partnerships", href: "/about/partnerships" },
      { label: "Excellence", href: "/about/excellence" },
      { label: "Founding Principal", href: "/about/founding-principal" },
      { label: "Faculty", href: "/faculty" },
      { label: "Why all-girls", href: "/about/all-girls-education" },
      { label: "Recognition", href: "/about/recognition" },
      { label: "Why Kesarbagh", href: "/about/why-kesarbagh" },
      { label: "Alumnae", href: "/about/alumnae" },
    ],
    feature: {
      title: "Walk the campus",
      href: "/virtual-tour",
      image: "/images/feature-virtual-tour.webp",
      caption: "A 360° tour of the Arch, the Glasshouse and the Long Field",
    },
  },
  {
    label: "Admissions",
    href: "/admissions",
    intro: "From first conversation to first day — clear steps, honest fees.",
    links: [
      { label: "Joining Aurelia Hall", href: "/admissions", blurb: "The six-step journey" },
      { label: "Scholarships", href: "/admissions/scholarships" },
      { label: "Fees: Full boarding", href: "/admissions/fees/full-boarding" },
      { label: "Fees: Day boarding", href: "/admissions/fees/day-boarding" },
      { label: "Register", href: "/admissions/register" },
      { label: "Book a visit", href: "/book-a-tour" },
      { label: "Events & open mornings", href: "/events" },
    ],
    feature: {
      title: "Open Morning",
      href: "/events",
      image: "/images/feature-open-morning.webp",
      caption: "Meet our girls, sit in on a lesson, ask anything",
    },
  },
  {
    label: "Academics",
    href: "/academics/curriculum",
    intro: "A British curriculum taught with ambition, warmth and an eye on the wider world.",
    links: [
      { label: "Pre-Prep (4–7)", href: "/academics/pre-prep" },
      { label: "Prep (7–11)", href: "/academics/prep" },
      { label: "Upper School (11–16)", href: "/academics/upper-school" },
      { label: "Sixth Form (16–18)", href: "/academics/sixth-form" },
      { label: "Why IGCSE", href: "/academics/why-igcse" },
      { label: "Curriculum", href: "/academics/curriculum" },
    ],
  },
  {
    label: "Boarding",
    href: "/boarding/full",
    intro: "Three ways to belong: full, flexi and day boarding.",
    links: [
      { label: "Full boarding", href: "/boarding/full" },
      { label: "Flexi boarding", href: "/boarding/flexi" },
      { label: "Day boarding", href: "/boarding/day" },
    ],
    feature: {
      title: "A day in the house",
      href: "/boarding/full",
      image: "/images/feature-boarding.webp",
      caption: "From morning bell to lights out",
    },
  },
  {
    label: "Programmes",
    href: "/programmes/the-atelier",
    intro: "Two signature programmes that only happen here.",
    links: [
      {
        label: "The Atelier",
        href: "/programmes/the-atelier",
        blurb: "Design, making and enterprise studio",
      },
      {
        label: "Horizon Fellowship",
        href: "/programmes/horizon-fellowship",
        blurb: "Leadership through service and expedition",
      },
    ],
  },
  {
    label: "Campus",
    href: "/campus/amenities",
    intro: "Fourteen acres of learning spaces, playing fields and quiet corners.",
    links: [
      { label: "Amenities", href: "/campus/amenities" },
      { label: "Sport", href: "/campus/sports" },
      { label: "Library", href: "/campus/library" },
      { label: "Transport", href: "/campus/transport" },
      { label: "Virtual tour", href: "/virtual-tour" },
    ],
  },
  {
    label: "Careers",
    href: "/careers",
    intro: "Teach, care and grow with a community that takes its people seriously.",
    links: [
      { label: "Work with us", href: "/careers" },
      { label: "Our teaching ethos", href: "/careers/teaching-ethos" },
      { label: "Living in Kesarbagh", href: "/careers/living-in-kesarbagh" },
      { label: "Community of care", href: "/careers/community-of-care" },
      { label: "Vacancies", href: "/careers/vacancies" },
      { label: "Staff application form", href: "/careers/apply" },
    ],
  },
];

export const utilityNav: NavLink[] = [
  { label: "Virtual tour", href: "/virtual-tour" },
  { label: "Blog", href: "/blog" },
  { label: "Events", href: "/events" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
];

export const footerNav: { label: string; links: NavLink[] }[] = [
  { label: "School", links: mainNav[0]!.links.slice(0, 6) },
  { label: "Admissions", links: mainNav[1]!.links },
  { label: "Learning", links: [...mainNav[2]!.links, ...mainNav[4]!.links] },
  {
    label: "More",
    links: [
      ...utilityNav,
      { label: "Careers", href: "/careers" },
      { label: "Parent portal", href: "/login" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Image credits", href: "/credits" },
    ],
  },
];

/** Flat list of every static public page (for sitemap + search + breadcrumbs). */
export function allStaticLinks(): NavLink[] {
  const seen = new Map<string, NavLink>();
  for (const g of mainNav) for (const l of g.links) seen.set(l.href, l);
  for (const l of [...utilityNav, ...footerNav.flatMap((f) => f.links)])
    if (!seen.has(l.href)) seen.set(l.href, l);
  seen.set("/", { label: "Home", href: "/" });
  seen.set("/book-a-tour", { label: "Book a visit", href: "/book-a-tour" });
  seen.set("/faculty", { label: "Faculty", href: "/faculty" });
  return [...seen.values()];
}

export function sectionFor(pathname: string): NavGroup | undefined {
  return mainNav.find(
    (g) =>
      g.links.some((l) => l.href === pathname) ||
      pathname.startsWith(g.href.split("/").slice(0, 2).join("/") + "/"),
  );
}
