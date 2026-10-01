import { PageHero } from "@/components/site/blocks";
import { TourViewer } from "@/components/site/tour-viewer";
import { getTour } from "@/lib/content";
import { pageMetadata } from "@/lib/seo/metadata";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";

export const metadata = pageMetadata({
  title: "Virtual tour",
  description: "Walk the campus in 360°: the North Arch, the library, the Glasshouse and the Long Field.",
  path: "/virtual-tour",
  image: "/images/virtual-tour.webp",
});

export default function VirtualTourPage() {
  return (
    <>
      <PageHero
        eyebrow="360° tour"
        title="Walk the campus"
        intro="Drag to look around, and use the arrows in each scene (or the list) to move between places."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Virtual tour", href: "/virtual-tour" },
        ]}
      />
      <section className="container-site py-12">
        <TourViewer tour={getTour()} />
      </section>
    </>
  );
}
