import { existsSync } from "node:fs";
import path from "node:path";
import { getImageProps } from "next/image";
import Link from "next/link";
import { school } from "@/config/school";
import { EnquireButton } from "./enquiry-context";
import { HeroVideo } from "./hero-video";

/** Art-directed hero image: one <picture>, so phones download only the portrait crop (LCP-critical). */
function HeroPicture() {
  const common = { alt: "", fill: true, sizes: "100vw", priority: true, fetchPriority: "high" as const };
  const { props: desktopProps } = getImageProps({ ...common, src: "/images/hero-home.webp" });
  const { props: mobileProps } = getImageProps({
    ...common,
    src: "/images/hero-home-mobile.webp",
    quality: 70,
  });
  return (
    <picture>
      <source media="(min-width: 640px)" srcSet={desktopProps.srcSet} sizes="100vw" />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative; alt="" is in mobileProps */}
      <img {...mobileProps} className="object-cover" />
    </picture>
  );
}

/**
 * Full-bleed home hero. If /public/herovideo/hero.mp4 (and optionally hero-mobile.mp4) exist, a muted looping
 * video is lazy-loaded over the still; otherwise the still gets a slow Ken Burns pan. The still is the LCP
 * image, so it is always rendered with priority.
 */
export function HomeHero() {
  const dir = path.join(process.cwd(), "public/herovideo");
  const desktop = existsSync(path.join(dir, "hero.mp4")) ? "/herovideo/hero.mp4" : null;
  const mobile = existsSync(path.join(dir, "hero-mobile.mp4")) ? "/herovideo/hero-mobile.mp4" : null;
  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-damson-950 text-paper">
      <div className="absolute inset-0 -z-10">
        <div className={desktop ? "absolute inset-0" : "ken-burns absolute inset-0"}>
          <HeroPicture />
        </div>
        {desktop && <HeroVideo desktop={desktop} mobile={mobile} />}
        <div className="absolute inset-0 bg-gradient-to-t from-damson-950/90 via-damson-950/35 to-damson-950/30" />
      </div>
      <div className="container-site pointer-events-none pt-36 pb-16 sm:pb-24 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <p className="t-eyebrow text-marigold-300">All-girls · Day & boarding · Ages {school.ages}</p>
        <h1 className="t-display mt-5 max-w-4xl">
          Curious minds.
          <br />
          <em className="text-marigold-300">Steady</em> hearts.
          <br />A life of purpose.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-damson-100">
          A British-curriculum school for girls on fourteen acres of hillside above {school.city} — where
          every girl is known, stretched and cared for.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/book-a-tour"
            className="rounded-full bg-marigold-500 px-7 py-4 font-semibold text-damson-950 transition-colors hover:bg-marigold-300"
          >
            Book a visit
          </Link>
          <EnquireButton className="rounded-full border border-paper/50 px-7 py-4 font-semibold backdrop-blur-sm transition-colors hover:bg-paper/10">
            Enquire now
          </EnquireButton>
          <Link
            href="/virtual-tour"
            className="rounded-full px-5 py-4 font-medium underline decoration-marigold-500 decoration-2 underline-offset-[6px] hover:text-marigold-300"
          >
            Take the 360° tour
          </Link>
        </div>
      </div>
      <p className="sr-only">
        Background: {"Morning light across the arched cloister of the main school building"}
      </p>
    </section>
  );
}
