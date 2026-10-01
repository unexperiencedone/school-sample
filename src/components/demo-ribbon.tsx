import { isDemoMode } from "@/config/school";
import { cn } from "@/lib/utils";

/** Small, tasteful marker on every page while NEXT_PUBLIC_DEMO_MODE=true. */
export function DemoRibbon({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  if (!isDemoMode()) return null;
  return (
    <p
      className={cn(
        "shadow-soft no-print pointer-events-none fixed bottom-3 left-3 z-40 rounded-full px-3 py-1 text-[0.68rem] font-semibold tracking-[0.14em] uppercase",
        tone === "light" ? "bg-marigold-500 text-damson-950" : "bg-damson-900 text-marigold-300",
        className,
      )}
    >
      Sample build · fictional school
    </p>
  );
}
