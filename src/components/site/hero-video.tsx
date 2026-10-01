"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** Loads the hero video after first paint (never blocks LCP), respects reduced motion and offers a pause control (WCAG 2.2.2). */
export function HeroVideo({ desktop, mobile }: { desktop: string; mobile: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const pick = () => setSrc(window.innerWidth < 768 && mobile ? mobile : desktop);
    const t = setTimeout(pick, 1200);
    return () => clearTimeout(t);
  }, [desktop, mobile]);
  if (!src) return null;
  return (
    <>
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster="/herovideo/frame-01.jpg"
        aria-hidden
      />
      <button
        type="button"
        className="absolute right-4 bottom-24 z-10 rounded-full bg-damson-950/50 p-2.5 text-paper backdrop-blur hover:bg-damson-950/70"
        aria-label={playing ? "Pause background video" : "Play background video"}
        onClick={() => {
          const v = ref.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
          setPlaying(!v.paused);
        }}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
    </>
  );
}
