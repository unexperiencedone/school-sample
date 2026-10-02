import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * `scrollLabel` makes the horizontal scroll area a labelled, focusable region so keyboard users can scroll a wide
 * table. Pass it for tables that can overflow (many columns); narrow tables don't need an extra tab stop.
 */
export function Table({
  className,
  scrollLabel,
  ...props
}: HTMLAttributes<HTMLTableElement> & { scrollLabel?: string }) {
  return (
    <div
      className={cn(
        "relative w-full overflow-x-auto",
        scrollLabel && "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus",
      )}
      {...(scrollLabel ? { role: "region", "aria-label": scrollLabel, tabIndex: 0 } : {})}
    >
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className="sticky top-0 z-[1] bg-sunken text-left text-xs font-semibold tracking-wide text-muted uppercase"
      {...props}
    />
  );
}
export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("border-b border-line px-3 py-2.5 font-semibold whitespace-nowrap", className)}
      {...props}
    />
  );
}
export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-line/70 transition-colors hover:bg-sunken/60", className)}
      {...props}
    />
  );
}
export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}
