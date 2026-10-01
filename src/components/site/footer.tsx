import Link from "next/link";
import { footerNav } from "@/config/nav";
import { school, isDemoMode } from "@/config/school";
import { Logo } from "@/components/brand/logo";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { CookieSettingsLink } from "./consent";

export function Footer() {
  return (
    <footer className="grain no-print relative overflow-hidden bg-damson-900 text-paper">
      <svg
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[44rem] text-damson-800"
        viewBox="0 0 48 56"
      >
        <path
          d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
        />
      </svg>
      <div className="container-site relative grid gap-12 py-16 lg:grid-cols-[1.3fr_2.7fr]">
        <div>
          <Link href="/">
            <Logo />
          </Link>
          <p className="mt-5 max-w-xs font-serif text-xl leading-snug text-damson-100 italic">
            {school.tagline}
          </p>
          <address className="mt-6 text-sm leading-relaxed text-damson-300 not-italic">
            {school.contact.address.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
            <a href={`tel:${school.contact.phoneHref}`} className="mt-2 inline-block py-1.5 hover:text-paper">
              {school.contact.phone}
            </a>
            <br />
            <a href={`mailto:${school.contact.email}`} className="inline-block py-1.5 hover:text-paper">
              {school.contact.email}
            </a>
          </address>
          <div className="mt-8 max-w-sm">
            <NewsletterForm />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {footerNav.map((col) => (
            <div key={col.label}>
              <p className="text-xs font-semibold tracking-[0.16em] text-marigold-300 uppercase">
                {col.label}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="link-underline text-damson-100 hover:text-paper">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="relative border-t border-damson-800">
        <div className="container-site flex flex-wrap items-center justify-between gap-4 py-6 text-xs text-damson-300">
          <p>
            © {new Date().getFullYear()} {school.legal.entity}.{" "}
            {isDemoMode() &&
              "Sample build — a fictional school created for demonstration. No real school, person or fee is represented."}
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-paper">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-paper">
              Terms
            </Link>
            <CookieSettingsLink className="hover:text-paper" />
            <Link href="/credits" className="hover:text-paper">
              Credits
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
