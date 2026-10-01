"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Menu, Search } from "lucide-react";
import { mainNav } from "@/config/nav";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useEnquiry } from "./enquiry-context";

const MobileMenu = dynamic(() => import("./mobile-menu"), { ssr: false });

/**
 * Site header with an accessible mega-menu (disclosure pattern: buttons with aria-expanded,
 * Esc closes, arrow keys move between top-level items) and a full-height mobile drawer.
 * `tone="dark"` renders light text over a hero image until the page scrolls.
 */
export function Header() {
  const pathname = usePathname();
  const tone: "light" | "dark" = pathname === "/" ? "dark" : "light";
  const [open, setOpen] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileMounted, setMobileMounted] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { openEnquiry } = useEnquiry();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (open === null) return;
    const onDoc = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        buttons.current[open]?.focus();
        close();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onTopKey = (e: React.KeyboardEvent, i: number) => {
    const n = mainNav.length;
    if (e.key === "ArrowRight") buttons.current[(i + 1) % n]?.focus();
    else if (e.key === "ArrowLeft") buttons.current[(i - 1 + n) % n]?.focus();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(i);
      requestAnimationFrame(() => document.querySelector<HTMLAnchorElement>(`#mega-${i} a`)?.focus());
    } else return;
    e.preventDefault();
  };

  const solid = tone === "light" || scrolled || open !== null;
  const group = open !== null ? mainNav[open] : null;

  return (
    <header
      ref={navRef}
      className={cn(
        "no-print sticky top-0 z-40 transition-[background-color,color,box-shadow] duration-300",
        solid
          ? "bg-paper/95 text-damson-900 shadow-[0_1px_0_var(--line)] backdrop-blur"
          : "bg-transparent text-paper",
        tone === "dark" && "-mb-20",
      )}
    >
      <div className="container-site flex h-20 items-center gap-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 justify-center xl:flex">
          <ul className="flex items-center gap-0.5">
            {mainNav.map((g, i) => {
              const active = pathname.startsWith(g.href.split("/").slice(0, 2).join("/"));
              return (
                <li key={g.label}>
                  <button
                    ref={(el) => {
                      buttons.current[i] = el;
                    }}
                    type="button"
                    aria-expanded={open === i}
                    aria-controls={`mega-${i}`}
                    onClick={() => setOpen(open === i ? null : i)}
                    onKeyDown={(e) => onTopKey(e, i)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.92rem] font-medium transition-colors",
                      solid ? "hover:bg-cream" : "hover:bg-white/10",
                      (open === i || active) && (solid ? "bg-cream" : "bg-white/10"),
                    )}
                  >
                    {g.label}
                    <ChevronDown
                      className={cn("size-3.5 opacity-60 transition-transform", open === i && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/search"
            className={cn("rounded-full p-2.5", solid ? "hover:bg-cream" : "hover:bg-white/10")}
            aria-label="Search the site"
          >
            <Search className="size-[1.1rem]" />
          </Link>
          <Link
            href="/login"
            className={cn(
              "hidden rounded-full px-3.5 py-2 text-sm font-medium lg:block",
              solid ? "hover:bg-cream" : "hover:bg-white/10",
            )}
          >
            Parent login
          </Link>
          <button
            type="button"
            onClick={() => openEnquiry("header")}
            className={cn(
              "hidden rounded-full px-5 py-2.5 text-sm font-semibold transition-colors sm:block",
              solid
                ? "bg-damson-800 text-paper hover:bg-damson-700"
                : "bg-paper text-damson-900 hover:bg-cream",
            )}
          >
            Enquire
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMounted(true);
              setMobile(true);
            }}
            className={cn("rounded-full p-2.5 xl:hidden", solid ? "hover:bg-cream" : "hover:bg-white/10")}
            aria-label="Open menu"
            aria-haspopup="dialog"
          >
            <Menu className="size-5" />
          </button>
          {mobileMounted && (
            <MobileMenu
              open={mobile}
              onOpenChange={setMobile}
              pathname={pathname}
              onEnquire={() => openEnquiry("mobile-menu")}
            />
          )}
        </div>
      </div>

      {group && open !== null && (
        <div
          id={`mega-${open}`}
          className="absolute inset-x-0 top-full border-t border-line bg-paper text-damson-900 shadow-lift"
        >
          <div className="container-site grid gap-10 py-10 lg:grid-cols-[1fr_2fr_1.2fr]">
            <div>
              <p className="t-eyebrow">{group.label}</p>
              <p className="mt-3 font-serif text-2xl leading-snug">{group.intro}</p>
              <Link
                href={group.href}
                className="mt-5 inline-block text-sm font-medium text-kiln-700 underline underline-offset-4"
                onClick={close}
              >
                Explore {group.label.toLowerCase()} →
              </Link>
            </div>
            <ul className="grid content-start gap-x-8 gap-y-1 sm:grid-cols-2">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={close}
                    className="group flex flex-col rounded-md px-3 py-2.5 transition-colors hover:bg-cream focus-visible:bg-cream"
                    aria-current={pathname === l.href ? "page" : undefined}
                  >
                    <span className="font-medium group-hover:text-damson-700">{l.label}</span>
                    {l.blurb && <span className="text-xs text-slate">{l.blurb}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {group.feature ? (
              <Link href={group.feature.href} onClick={close} className="group hidden lg:block">
                <div className="arch-sm relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={group.feature.image}
                    alt=""
                    fill
                    sizes="25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <p className="mt-3 font-serif text-lg">{group.feature.title}</p>
                <p className="text-sm text-slate">{group.feature.caption}</p>
              </Link>
            ) : (
              <div className="hidden rounded-lg bg-damson-50 p-6 lg:block">
                <p className="font-serif text-xl">Come and see for yourself</p>
                <p className="mt-2 text-sm text-slate">
                  Open Mornings run each term, and private tours most weekdays.
                </p>
                <Link
                  href="/book-a-tour"
                  onClick={close}
                  className="mt-4 inline-block rounded-full bg-damson-800 px-4 py-2 text-sm text-paper"
                >
                  Book a visit
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
