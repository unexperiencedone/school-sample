/**
 * Fills every slot in content/images.manifest.json with a local, optimised WebP in public/images/.
 *
 *   pnpm images:fetch            # fetch missing slots
 *   pnpm images:fetch --force    # refetch everything
 *   pnpm images:fetch --placeholders  # regenerate designed placeholders only (offline)
 *
 * Providers (official APIs only, keys are free):
 *   UNSPLASH_ACCESS_KEY → https://unsplash.com/developers  (create an app; 50 req/h in demo mode)
 *   PEXELS_API_KEY      → https://www.pexels.com/api/      (200 req/h)
 * Unsplash rules honoured: hotlinking is not used at runtime (we download once and serve locally — allowed
 * for downloaded images), the download endpoint is triggered for every photo, and photographers are credited
 * in docs/CREDITS.md and on /credits. Panoramas, avatars and the map are always generated (never stock faces).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { placeholderSvg, sizeFor } from "./placeholders";
import { writeCredits } from "./build-credits";

type Credit = { photographer: string; source: "Unsplash" | "Pexels" | "Generated"; url: string } | null;
type Slot = {
  slot: string;
  query: string;
  orientation: string;
  minWidth: number;
  alt: string;
  scene: string;
  credit: Credit;
  localPath: string;
};

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "content/images.manifest.json");
const OUT = path.join(ROOT, "public/images");
const ALWAYS_GENERATED = new Set(["panorama", "avatar", "map"]);
const UTM = "utm_source=aurelia_hall_sample&utm_medium=referral";

/** WebP for site images; high-quality JPEG for /herovideo frames (friendlier to video tools). */
function encode(img: ReturnType<typeof sharp>, file: string) {
  return file.endsWith(".jpg")
    ? img.jpeg({ quality: 90, mozjpeg: true }).toFile(file)
    : img.webp({ quality: 80 }).toFile(file);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fromUnsplash(s: Slot, key: string): Promise<{ buf: Buffer; credit: Credit } | null> {
  const orientation =
    s.orientation === "squarish" ? "squarish" : s.orientation === "portrait" ? "portrait" : "landscape";
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(s.query)}&orientation=${orientation}&per_page=1&content_filter=high`,
    {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    },
  );
  if (res.status === 403 || res.status === 429)
    throw new Error("Unsplash rate limit reached — rerun later; existing files are kept.");
  if (!res.ok) return null;
  const body = (await res.json()) as {
    results: {
      urls: { raw: string };
      links: { download_location: string };
      user: { name: string; links: { html: string } };
    }[];
  };
  const photo = body.results[0];
  if (!photo) return null;
  await fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${key}` } }); // required download tracking
  const img = await fetch(`${photo.urls.raw}&w=${s.minWidth}&fm=jpg&q=82&fit=max`);
  return {
    buf: Buffer.from(await img.arrayBuffer()),
    credit: { photographer: photo.user.name, source: "Unsplash", url: `${photo.user.links.html}?${UTM}` },
  };
}

async function fromPexels(s: Slot, key: string): Promise<{ buf: Buffer; credit: Credit } | null> {
  const orientation =
    s.orientation === "squarish" ? "square" : s.orientation === "portrait" ? "portrait" : "landscape";
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(s.query)}&orientation=${orientation}&per_page=1`,
    { headers: { Authorization: key } },
  );
  if (res.status === 429) throw new Error("Pexels rate limit reached — rerun later.");
  if (!res.ok) return null;
  const body = (await res.json()) as {
    photos: { src: { original: string }; photographer: string; photographer_url: string }[];
  };
  const photo = body.photos[0];
  if (!photo) return null;
  const img = await fetch(`${photo.src.original}?auto=compress&cs=tinysrgb&w=${s.minWidth}`);
  return {
    buf: Buffer.from(await img.arrayBuffer()),
    credit: { photographer: photo.photographer, source: "Pexels", url: photo.photographer_url },
  };
}

async function main() {
  const force = process.argv.includes("--force");
  const placeholdersOnly = process.argv.includes("--placeholders");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { $comment: string; slots: Slot[] };
  mkdirSync(OUT, { recursive: true });
  mkdirSync(path.join(ROOT, "public/herovideo"), { recursive: true });
  const unsplash = process.env.UNSPLASH_ACCESS_KEY;
  const pexels = process.env.PEXELS_API_KEY;
  const needsPhoto: string[] = [];

  for (const s of manifest.slots) {
    const file = path.join(ROOT, "public", s.localPath);
    const isStock = s.credit && s.credit.source !== "Generated";
    if (existsSync(file) && !force && (isStock || !(unsplash || pexels) || placeholdersOnly)) {
      if (!isStock && !ALWAYS_GENERATED.has(s.scene)) needsPhoto.push(s.slot);
      if (!placeholdersOnly || isStock) continue;
    }
    const [w, h] = sizeFor(s.orientation, s.minWidth);
    let result: { buf: Buffer; credit: Credit } | null = null;
    if (!placeholdersOnly && !ALWAYS_GENERATED.has(s.scene)) {
      try {
        if (unsplash) result = await fromUnsplash(s, unsplash);
        if (!result && pexels) result = await fromPexels(s, pexels);
        if (unsplash || pexels) await sleep(1200);
      } catch (e) {
        console.warn(`! ${(e as Error).message}`);
        break;
      }
    }
    if (result) {
      await encode(
        sharp(result.buf).resize({ width: w, height: h, fit: "cover", position: "attention" }),
        file,
      );
      s.credit = result.credit;
      console.log(`✓ ${s.slot} ← ${result.credit!.source} / ${result.credit!.photographer}`);
    } else {
      await encode(sharp(Buffer.from(placeholderSvg(s.slot, s.scene, w, h))), file);
      s.credit = { photographer: "Aurelia Hall sample build", source: "Generated", url: "" };
      if (!ALWAYS_GENERATED.has(s.scene)) needsPhoto.push(s.slot);
      console.log(`• ${s.slot} (placeholder ${w}×${h})`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  writeCredits(manifest.slots);
  if (needsPhoto.length) {
    console.log(
      `\n${needsPhoto.length} slots still use generated placeholders. Set UNSPLASH_ACCESS_KEY or PEXELS_API_KEY and run \`pnpm images:fetch --force\`:`,
    );
    console.log("  " + [...new Set(needsPhoto)].join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
