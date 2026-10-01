import { school } from "@/config/school";

/**
 * Maps: `static` (default) renders a local image with an outbound link — no key, no third-party script.
 * `google` renders a Google Maps Embed API iframe (needs NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY) and only after consent.
 */
export type MapConfig =
  | { mode: "static"; image: string; link: string; label: string }
  | { mode: "google"; embedUrl: string; link: string; label: string };

export function getMapConfig(): MapConfig {
  const label = `${school.name} campus map`;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  if (process.env.MAPS_PROVIDER === "google" && key) {
    const q = encodeURIComponent(`${school.map.lat},${school.map.lng}`);
    return {
      mode: "google",
      embedUrl: `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}`,
      link: school.map.link,
      label,
    };
  }
  return { mode: "static", image: school.map.staticImage, link: school.map.link, label };
}

export const MAPS_ENV: Record<string, string[]> = {
  static: [],
  google: ["NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY"],
};
