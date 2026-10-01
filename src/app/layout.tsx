import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { school, siteUrl } from "@/config/school";
import "@/styles/globals.css";

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-opsz.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/fraunces-opsz-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-fraunces",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
});

const hanken = localFont({
  src: [
    { path: "./fonts/hanken-grotesk.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/hanken-grotesk-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-hanken",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

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
    <html lang="en-IN" className={`${fraunces.variable} ${hanken.variable}`} suppressHydrationWarning>
      <head>
        {/* Enables progressive scroll-reveal styles only when JS runs. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "font-sans" } }} />
      </body>
    </html>
  );
}
