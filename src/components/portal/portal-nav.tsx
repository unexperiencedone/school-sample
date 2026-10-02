"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Child = { id: string; name: string; className: string };

/** Section links and the child switcher. The chosen child rides along in `?child=` so every page agrees. */
export function PortalNav({ items, kids }: { items: { href: string; label: string }[]; kids: Child[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const child = sp.get("child") ?? kids[0]?.id ?? "";
  const withChild = (href: string) => (child && kids.length > 1 ? `${href}?child=${child}` : href);
  return (
    <div className="border-b border-line bg-elevated">
      <div className="container-site flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
        {kids.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Viewing</span>
            <select
              value={child}
              onChange={(e) => router.push(`${pathname}?child=${e.target.value}`)}
              className="h-9 rounded-md border border-line bg-elevated px-2 font-medium"
            >
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} · {k.className}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav aria-label="Parent portal" className="-mx-2 flex overflow-x-auto">
          {items.map((i) => {
            const active = i.href === "/portal" ? pathname === "/portal" : pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={withChild(i.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-2 text-sm whitespace-nowrap",
                  active ? "font-semibold text-primary" : "text-muted hover:text-fg",
                )}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
