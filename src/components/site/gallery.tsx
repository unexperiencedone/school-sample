"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { cn } from "@/lib/utils";

export type GalleryImage = { src: string; alt: string; caption?: string };

/** Masonry-ish gallery with a keyboard-accessible lightbox (←/→, Esc, focus trapped by Radix). */
export function Gallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const go = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + images.length) % images.length)),
    [images.length],
  );
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);
  const current = index !== null ? images[index] : null;
  return (
    <>
      <ul className="my-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.src} data-reveal className={cn(i % 5 === 0 && "md:col-span-2 md:row-span-2")}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-md"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 768px) 25vw, 50vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-damson-950/70 to-transparent p-3 text-left text-sm text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {img.caption ?? img.alt}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <D.Root open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-damson-950/90" />
          <D.Content className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 focus:outline-none">
            <D.Title className="sr-only">{current?.alt ?? "Image"}</D.Title>
            <D.Description className="sr-only">Use the arrow keys to move between images.</D.Description>
            {current && (
              <figure className="relative flex max-h-full w-full max-w-5xl flex-col">
                <div className="relative aspect-[3/2] w-full">
                  <Image src={current.src} alt={current.alt} fill sizes="90vw" className="object-contain" />
                </div>
                <figcaption className="mt-3 text-center text-sm text-damson-100">
                  {current.caption ?? current.alt} · {index! + 1} / {images.length}
                </figcaption>
              </figure>
            )}
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-3 rounded-full bg-paper/10 p-3 text-paper hover:bg-paper/20"
              aria-label="Previous image"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute top-1/2 right-3 rounded-full bg-paper/10 p-3 text-paper hover:bg-paper/20"
              aria-label="Next image"
            >
              <ChevronRight className="size-6" />
            </button>
            <D.Close
              className="absolute top-4 right-4 rounded-full bg-paper/10 p-3 text-paper hover:bg-paper/20"
              aria-label="Close"
            >
              <X className="size-5" />
            </D.Close>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
