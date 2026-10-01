import { school } from "@/config/school";
import { cn } from "@/lib/utils";

/**
 * Original mark: an arched doorway (the "Hall") framing a rising sun (Aurelia, "golden").
 * Pure SVG so it scales, recolours via currentColor and never needs a raster file.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 56"
      className={cn("h-10 w-auto", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path
        d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M11 54V25.5C11 18.6 16.82 13 24 13s13 5.6 13 12.5V54"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <path d="M15 42a9 9 0 0 1 18 0Z" fill="var(--accent, #e3a72f)" />
      <g stroke="var(--accent, #e3a72f)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M24 28.5v-3.2" />
        <path d="M16.6 31.6l-2.2-2.2" />
        <path d="M31.4 31.6l2.2-2.2" />
        <path d="M13.2 37.6h-3" />
        <path d="M34.8 37.6h3" />
      </g>
      <path d="M8 46.5h32" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 54h44" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const [first, ...rest] = school.shortName.split(" ");
  return (
    <span className={cn("inline-flex items-center gap-3 text-current", className)}>
      <LogoMark className="h-10 shrink-0" />
      {!compact && (
        <span className="flex flex-col leading-none" aria-hidden="true">
          <span className="font-serif text-[1.45rem] tracking-[-0.01em]">
            {first} <span className="font-light">{rest.join(" ")}</span>
          </span>
          <span className="mt-1 text-[0.6rem] font-semibold tracking-[0.42em] uppercase opacity-75">
            School
          </span>
        </span>
      )}
      <span className="sr-only">{school.name}</span>
    </span>
  );
}
