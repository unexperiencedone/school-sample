# Hero video source frames

Stills for building the home-page hero video. They are listed in order in `content/images.manifest.json`
(slots `herovideo-01` … `herovideo-08`).

| File         | Shot                                             |
| ------------ | ------------------------------------------------ |
| frame-01.jpg | Sunrise through the cloister arches              |
| frame-02.jpg | Pupils walking to morning assembly (from behind) |
| frame-03.jpg | Sunlight in the library reading room             |
| frame-04.jpg | Hands at work in the science lab                 |
| frame-05.jpg | Morning mist over the playing fields             |
| frame-06.jpg | Brushes and easels in the art studio             |
| frame-07.jpg | Golden hour over the hills                       |
| frame-08.jpg | The North Arch at dusk                           |

All frames are 1920×1080 JPEG. Out of the box they are generated illustrations; to replace them with
licensed stock photos (Unsplash/Pexels, credited automatically in `docs/CREDITS.md`):

```bash
UNSPLASH_ACCESS_KEY=... pnpm images:fetch --force   # or PEXELS_API_KEY=...
```

You can also drop your own photos here with the same file names.

## Using the video on the site

The hero picks the video up automatically — no code change — when these files exist:

| File              | Used for                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `hero.mp4`        | Desktop (≥ 768 px), 1920×1080, H.264, muted, ~10–20 s loop, ideally < 4 MB |
| `hero-mobile.mp4` | Mobile, 720×1280 (portrait), < 2 MB                                        |
| `hero-poster.jpg` | First frame / poster (optional; falls back to `frame-01.jpg`)              |

Until then the hero shows a still with a slow Ken Burns pan. Visitors with "reduce motion" always see the still.

## Quick slideshow with ffmpeg

Crossfading slideshow, 3 s per frame, 1 s dissolves, with a gentle zoom:

```bash
cd public/herovideo
ffmpeg -y -framerate 1/3 -pattern_type glob -i 'frame-*.jpg' \
  -vf "zoompan=z='min(zoom+0.0008,1.08)':d=90:s=1920x1080:fps=30,format=yuv420p" \
  -c:v libx264 -crf 24 -preset slow -movflags +faststart -an hero.mp4

# portrait cut for phones
ffmpeg -y -i hero.mp4 -vf "crop=ih*9/16:ih,scale=720:1280" -c:v libx264 -crf 26 -movflags +faststart -an hero-mobile.mp4
ffmpeg -y -i hero.mp4 -frames:v 1 -q:v 3 hero-poster.jpg
```
