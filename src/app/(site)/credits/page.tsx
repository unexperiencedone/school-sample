import { PageHero } from "@/components/site/blocks";
import { getImageSlots } from "@/lib/content";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Image credits",
  description: "Photographers and sources for images used on this sample site.",
  path: "/credits",
});

export default function CreditsPage() {
  const slots = getImageSlots();
  const stock = slots.filter((s) => s.credit && s.credit.source !== "Generated");
  const generated = slots.length - stock.length;
  return (
    <>
      <PageHero
        title="Image credits"
        intro="Stock photographs come only from Unsplash and Pexels under their free licences and are served from this site. Illustrations are original artwork generated for this sample build."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Credits", href: "/credits" },
        ]}
      />
      <section className="container-prose py-16">
        {stock.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {stock.map((s) => (
              <li key={s.slot} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>{s.alt}</span>
                <a
                  href={s.credit!.url}
                  className="text-damson-800 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.credit!.photographer} / {s.credit!.source}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No stock photographs are in use yet.</p>
        )}
        <p className="mt-8 text-sm text-muted">
          {generated} images are original illustrations created for this sample build (portraits, panoramas,
          map and placeholders).
        </p>
        <h2 className="t-h3 mt-12 text-primary">Typefaces</h2>
        <p className="mt-2 text-sm text-muted">
          Fraunces (Undercase Type) and Hanken Grotesk (Hanken Design Co.), both under the SIL Open Font
          License 1.1.
        </p>
      </section>
    </>
  );
}
