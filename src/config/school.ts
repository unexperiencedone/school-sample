/**
 * Single source of truth for the (fictional) school identity.
 * Rename the school by changing `name`, `shortName` and `domain` here.
 * Every contact detail is an obviously fake placeholder.
 */
export const school = {
  name: "Aurelia Hall School",
  shortName: "Aurelia Hall",
  monogram: "AH",
  tagline: "Curious minds. Steady hearts. A life of purpose.",
  description:
    "An all-girls British-curriculum day and boarding school for ages 4 to 18, set on a fourteen-acre hillside campus.",
  founded: 2019,
  campusAcres: 14,
  ages: "4–18",
  curriculum: "British (EYFS, Key Stages 1–3, IGCSE and A Level)",
  city: "Kesarbagh",
  region: "the Western Ghats foothills",
  domain: "aurelia-sample.test",
  contact: {
    phone: "+91 00000 00000",
    phoneHref: "+910000000000",
    admissionsPhone: "+91 00000 00001",
    whatsapp: "910000000000",
    email: "hello@aurelia-sample.test",
    admissionsEmail: "admissions@aurelia-sample.test",
    careersEmail: "careers@aurelia-sample.test",
    accountsEmail: "accounts@aurelia-sample.test",
    address: ["Aurelia Hall School (sample)", "1 Placeholder Ridge Road", "Kesarbagh 000 000", "India"],
    hours: "Mon–Fri, 8:30 am – 4:30 pm IST",
  },
  social: {
    instagram: "https://example.com/aurelia-sample-instagram",
    linkedin: "https://example.com/aurelia-sample-linkedin",
    youtube: "https://example.com/aurelia-sample-youtube",
  },
  map: {
    // Static placeholder image + external link. No API key required.
    staticImage: "/images/map-placeholder.webp",
    link: "https://www.openstreetmap.org/#map=14/18.5/73.8",
    lat: 18.5,
    lng: 73.8,
  },
  registrationFeePaise: 1_000_000, // ₹10,000 (placeholder)
  receiptPrefix: "AHR",
  invoicePrefix: "AHI",
  applicationPrefix: "AH",
  staffApplicationPrefix: "AHS",
  legal: {
    entity: "Aurelia Hall Educational Trust (sample entity)",
    registration: "TRUST-REG-000000 (placeholder)",
    pan: "AAAAA0000A (placeholder)",
  },
} as const;

export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
