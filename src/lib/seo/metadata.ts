import type { Metadata } from "next";
import { school, siteUrl } from "@/config/school";

/** Per-page metadata with canonical URL and Open Graph image. */
export function pageMetadata({
  title,
  description,
  path,
  image,
  noindex,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = `${siteUrl()}${path}`;
  const og = image ?? "/images/og-default.webp";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type,
      siteName: school.name,
      images: [{ url: og, width: 1200, height: 744, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [og] },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
