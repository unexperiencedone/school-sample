import Image from "next/image";
import { PageHero } from "@/components/site/blocks";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Book a campus visit",
  description: "Choose a date and time to walk the campus with our admissions team.",
  path: "/book-a-tour",
  image: "/images/tour-booking.webp",
});

export default function BookATourPage() {
  return (
    <>
      <PageHero
        eyebrow="Visit"
        title="Book a campus visit"
        intro="Tours last about 75 minutes and include classrooms in session, a boarding house and time with a head of section. Choose a date and we'll confirm straight away."
        image="/images/tour-booking.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Admissions", href: "/admissions" },
          { name: "Book a visit", href: "/book-a-tour" },
        ]}
      />
      <section className="container-site grid gap-14 py-16 lg:grid-cols-[1.4fr_1fr] lg:py-20">
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-soft sm:p-10">
          <EnquiryForm source="book-a-tour" type="TOUR" />
        </div>
        <aside className="space-y-6">
          <div className="arch relative aspect-[4/5] overflow-hidden">
            <Image
              src="/images/gallery-cloister.webp"
              alt="The cloister"
              fill
              sizes="(min-width: 1024px) 30vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="font-serif text-xl text-primary">What to expect</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Arrive at the North Arch ten minutes early; bring photo ID.</li>
              <li>Children are very welcome on tours.</li>
              <li>Tours run Monday to Saturday at 9:30, 11:30 and 2:30.</li>
              <li>Each slot hosts up to six families so you can ask everything.</li>
            </ul>
          </div>
        </aside>
      </section>
    </>
  );
}
