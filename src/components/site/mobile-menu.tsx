"use client";

import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { mainNav, utilityNav } from "@/config/nav";
import { Logo } from "@/components/brand/logo";

/** Full-height mobile navigation drawer (code-split; loads on first open). */
export default function MobileMenu({
  open,
  onOpenChange,
  pathname,
  onEnquire,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pathname: string;
  onEnquire: () => void;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-damson-950/50" />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-paper text-damson-900 shadow-lift data-[state=open]:animate-[sheet-in_320ms_var(--ease-out)]">
          <div className="flex h-20 items-center justify-between border-b border-line px-5">
            <D.Title className="sr-only">Menu</D.Title>
            <D.Description className="sr-only">Site navigation</D.Description>
            <Logo />
            <D.Close className="rounded-full p-2 hover:bg-cream" aria-label="Close menu">
              <X className="size-5" />
            </D.Close>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-4">
            {mainNav.map((g) => (
              <details key={g.label} className="group border-b border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-serif text-xl">
                  {g.label}
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="pb-4">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="block py-2 text-[0.95rem] text-slate hover:text-damson-800"
                        aria-current={pathname === l.href ? "page" : undefined}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <ul className="mt-6 grid grid-cols-2 gap-2 text-sm">
              {utilityNav.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block rounded-md bg-cream px-3 py-2.5">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/login" className="block rounded-md bg-cream px-3 py-2.5">
                  Parent login
                </Link>
              </li>
            </ul>
          </nav>
          <div className="border-t border-line p-5">
            <button
              type="button"
              className="w-full rounded-full bg-damson-800 py-3.5 font-semibold text-paper"
              onClick={() => {
                onOpenChange(false);
                onEnquire();
              }}
            >
              Enquire now
            </button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
