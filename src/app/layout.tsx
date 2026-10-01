import type { Metadata, Viewport } from "next";
import { school, siteUrl } from "@/config/school";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${school.name} — ${school.tagline}`, template: `%s · ${school.name}` },
  description: school.description,
  applicationName: school.name,
  openGraph: { type: "website", siteName: school.name, locale: "en_IN" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#3d1d38",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Only the upright faces are preloaded; italics load on demand so they never compete with the LCP image. */}
        <link
          rel="preload"
          href="/fonts/fraunces-opsz.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/hanken-grotesk.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Enables progressive scroll-reveal styles only when JS runs. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
