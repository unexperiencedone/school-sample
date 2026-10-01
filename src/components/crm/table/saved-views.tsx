"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Bookmark, X } from "lucide-react";
import { deleteView, saveView } from "@/lib/crm/saved-view-actions";

/** Per-user saved filter combinations for a module. */
export function SavedViews({
  module,
  views,
}: {
  module: string;
  views: { id: string; name: string; query: string }[];
}) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const current = sp.toString().replace(/(^|&)(after|before)=[^&]*/g, "");
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={pathname}
        className={`rounded-full px-3 py-1 ${current ? "text-muted hover:bg-sunken" : "bg-sunken font-medium"}`}
      >
        All
      </Link>
      {views.map((v) => (
        <span
          key={v.id}
          className={`group inline-flex items-center rounded-full ${current === v.query ? "bg-damson-100 font-medium text-damson-800 dark:bg-damson-900 dark:text-damson-100" : "hover:bg-sunken"}`}
        >
          <Link href={`${pathname}?${v.query}`} className="py-1 pl-3">
            {v.name}
          </Link>
          <button
            type="button"
            aria-label={`Delete view ${v.name}`}
            onClick={() => start(() => deleteView(v.id, pathname))}
            className="rounded-full p-1 pr-2 opacity-40 group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {current && !views.some((v) => v.query === current) && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const name = window.prompt("Name this view");
            if (name) start(() => saveView(module, name, current, pathname));
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1 text-muted hover:text-fg"
        >
          <Bookmark className="size-3.5" aria-hidden /> Save view
        </button>
      )}
    </div>
  );
}
