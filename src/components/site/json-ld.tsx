import { school, siteUrl } from "@/config/school";

/** Renders a JSON-LD script. Content is escaped to prevent </script> injection. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function schoolJsonLd() {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": ["School", "Organization"],
    "@id": `${url}/#school`,
    name: school.name,
    url,
    logo: `${url}/favicon.svg`,
    description: school.description,
    foundingDate: String(school.founded),
    email: school.contact.email,
    telephone: school.contact.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: school.contact.address[1],
      addressLocality: school.city,
      addressCountry: "IN",
    },
    geo: { "@type": "GeoCoordinates", latitude: school.map.lat, longitude: school.map.lng },
    sameAs: Object.values(school.social),
  };
}

export function breadcrumbJsonLd(items: { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${siteUrl()}${it.href}`,
    })),
  };
}
