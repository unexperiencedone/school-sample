"use client";

import { useEffect, useRef, useState } from "react";
import type { TourData } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * 360° viewer built on Photo Sphere Viewer + Virtual Tour plugin. Scenes and hotspots come from content/tour.json,
 * so real equirectangular captures can be dropped into /public/images (same file names) without code changes.
 * A scene list gives a keyboard-friendly alternative to the hotspots.
 */
export function TourViewer({ tour }: { tour: TourData }) {
  const el = useRef<HTMLDivElement>(null);
  const plugin = useRef<{ setCurrentNode: (id: string) => void } | null>(null);
  const [current, setCurrent] = useState(tour.start);
  const [error, setError] = useState(false);

  useEffect(() => {
    let viewer: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ Viewer }, { VirtualTourPlugin }, { MarkersPlugin }] = await Promise.all([
          import("@photo-sphere-viewer/core"),
          import("@photo-sphere-viewer/virtual-tour-plugin"),
          import("@photo-sphere-viewer/markers-plugin"),
        ]);
        if (cancelled || !el.current) return;
        const v = new Viewer({
          container: el.current,
          loadingTxt: "Loading panorama…",
          defaultZoomLvl: 10,
          navbar: ["zoom", "move", "caption", "fullscreen"],
          plugins: [
            MarkersPlugin,
            [
              VirtualTourPlugin,
              {
                positionMode: "manual",
                renderMode: "2d",
                startNodeId: tour.start,
                nodes: tour.scenes.map((s) => ({
                  id: s.id,
                  panorama: s.panorama,
                  name: s.name,
                  caption: `${s.name} — ${s.caption}`,
                  links: s.links.map((l) => ({ nodeId: l.to, position: { yaw: l.yaw, pitch: l.pitch } })),
                })),
              },
            ],
          ],
        });
        const vt = v.getPlugin(VirtualTourPlugin) as unknown as {
          setCurrentNode: (id: string) => void;
          addEventListener: (e: string, cb: (ev: { node: { id: string } }) => void) => void;
        };
        vt.addEventListener("node-changed", (ev) => setCurrent(ev.node.id));
        plugin.current = vt;
        viewer = v;
      } catch (e) {
        console.error("[tour]", e);
        setError(true);
      }
    })();
    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [tour]);

  const scene = tour.scenes.find((s) => s.id === current)!;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <div
          ref={el}
          className="aspect-[16/10] w-full overflow-hidden rounded-lg bg-damson-950"
          role="application"
          aria-label={`360 degree view: ${scene.name}. Drag or use the arrow buttons to look around.`}
        />
        {error && (
          <p className="mt-3 text-sm text-danger">
            The 360° viewer couldn&apos;t load in this browser. Use the scene list to view stills.
          </p>
        )}
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {scene.name}: {scene.caption}
        </p>
      </div>
      <nav aria-label="Tour scenes">
        <p className="t-eyebrow">Scenes</p>
        <ol className="mt-3 space-y-2">
          {tour.scenes.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => plugin.current?.setCurrentNode(s.id)}
                aria-current={s.id === current}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
                  s.id === current ? "border-damson-800 bg-damson-50" : "border-line hover:bg-cream",
                )}
              >
                <span className="font-serif text-lg text-kiln-700">{i + 1}</span>
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">{s.caption}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Panoramas are placeholders. Replace pano-*.webp in /public/images with real 2:1 equirectangular
          captures.
        </p>
      </nav>
    </div>
  );
}
