import { isDemoMode } from "@/config/school";
import { cn } from "@/lib/utils";

/** Small, unobtrusive marker on every page while NEXT_PUBLIC_DEMO_MODE=true: a vertical tab on the left edge. */
export function DemoRibbon({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  if (!isDemoMode()) return null;
  return (
    <p
      className={cn(
        "no-print pointer-events-none fixed top-1/2 left-0 z-40 -translate-y-1/2 rotate-180 rounded-l-md px-1 py-3 text-[0.6rem] font-semibold tracking-[0.18em] uppercase shadow-soft [writing-mode:vertical-rl]",
        tone === "light" ? "bg-marigold-500 text-damson-950" : "bg-damson-900 text-marigold-300",
        className,
      )}
    >
      Sample build
    </p>
  );
}
