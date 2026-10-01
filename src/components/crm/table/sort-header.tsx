import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { qs } from "@/lib/crm/qs";
import { Th } from "@/components/ui/table";

/** Column header that toggles ?sort=&dir= and exposes aria-sort. */
export function SortTh({
  sp,
  field,
  label,
  current,
  dir,
  className,
}: {
  sp: Record<string, string | string[] | undefined>;
  field: string;
  label: string;
  current: string;
  dir: "asc" | "desc";
  className?: string;
}) {
  const active = current === field;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <Link
        href={qs(sp, { sort: field, dir: nextDir })}
        className="inline-flex items-center gap-1 hover:text-fg"
      >
        {label}
        <Icon className={`size-3 ${active ? "text-fg" : "opacity-50"}`} aria-hidden />
      </Link>
    </Th>
  );
}
