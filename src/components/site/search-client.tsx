"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SearchDoc } from "@/lib/search-index";

function score(doc: SearchDoc, terms: string[]): number {
  const title = doc.title.toLowerCase();
  const text = doc.text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (title.includes(t)) s += title.startsWith(t) ? 12 : 8;
    if (text.includes(t)) s += 2;
    else if (!title.includes(t)) return 0;
  }
  return s;
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const at = Math.max(
    0,
    Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length) - 60,
  );
  return (at > 0 ? "…" : "") + text.slice(at, at + 180) + "…";
}

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  useEffect(() => {
    fetch("/api/search")
      .then((r) => r.json())
      .then((b: { data: SearchDoc[] }) => setDocs(b.data))
      .catch(() => setDocs([]));
  }, []);
  useEffect(() => {
    const t = setTimeout(
      () => router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false }),
      300,
    );
    return () => clearTimeout(t);
  }, [q, router]);
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const results = useMemo(() => {
    if (!docs || !terms.length) return [];
    return docs
      .map((d) => ({ d, s: score(d, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, q]);

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
        <label htmlFor="site-search" className="sr-only">
          Search the site
        </label>
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="site-search"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try “boarding”, “scholarship”, “swimming”…"
          className="h-14 w-full rounded-full border border-line-strong bg-elevated pr-5 pl-12 text-lg focus-visible:border-primary"
        />
      </form>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {docs === null
          ? "Loading index…"
          : terms.length
            ? `${results.length} result${results.length === 1 ? "" : "s"}`
            : "Type to search pages, sections, sports, people, posts, events and vacancies."}
      </p>
      <ul className="mt-6 divide-y divide-line">
        {results.map(({ d }) => (
          <li key={d.href} className="py-5">
            <Link href={d.href} className="group block">
              <span className="text-xs tracking-wider text-kiln-700 uppercase">{d.type}</span>
              <span className="mt-0.5 block font-serif text-xl text-primary group-hover:underline">
                {d.title}
              </span>
              {d.text && <span className="mt-1 block text-sm text-muted">{snippet(d.text, terms)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
