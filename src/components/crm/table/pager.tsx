import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { qs } from "@/lib/crm/qs";

/** Cursor pager: previous/next links plus the total count. */
export function Pager({
  sp,
  next,
  prev,
  total,
  shown,
}: {
  sp: Record<string, string | string[] | undefined>;
  next: string | null;
  prev: string | null;
  total: number;
  shown: number;
}) {
  const cls = "inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-sm";
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-sm text-muted"
    >
      <span>
        {shown} shown · {total.toLocaleString("en-IN")} total
      </span>
      <span className="flex gap-2">
        {prev ? (
          <Link className={`${cls} hover:bg-sunken`} href={qs(sp, { after: null, before: prev })}>
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Link>
        ) : (
          <span className={`${cls} opacity-40`} aria-disabled>
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </span>
        )}
        {next ? (
          <Link className={`${cls} hover:bg-sunken`} href={qs(sp, { before: null, after: next })}>
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={`${cls} opacity-40`} aria-disabled>
            Next <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </span>
    </nav>
  );
}
