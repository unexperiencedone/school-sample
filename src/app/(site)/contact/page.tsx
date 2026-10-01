import Image from "next/image";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/site/blocks";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMapConfig } from "@/integrations/maps";
import { pageMetadata } from "@/lib/seo/metadata";
import { school } from "@/config/school";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with admissions, book a campus tour, or find us on the map.",
  path: "/contact",
  image: "/images/contact.webp",
});

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const map = getMapConfig();
  const cards = [
    {
      icon: Phone,
      title: "Admissions",
      lines: [school.contact.admissionsPhone, school.contact.admissionsEmail],
      href: `tel:${school.contact.phoneHref}`,
    },
    {
      icon: Mail,
      title: "General",
      lines: [school.contact.phone, school.contact.email],
      href: `mailto:${school.contact.email}`,
    },
    {
      icon: MessageCircle,
      title: "WhatsApp",
      lines: ["Chat with admissions", school.contact.phone],
      href: `https://wa.me/${school.contact.whatsapp}?utm_source=website&utm_medium=contact_page`,
    },
    {
      icon: Clock,
      title: "Office hours",
      lines: [school.contact.hours, "Tours by appointment on Saturdays"],
    },
  ];
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="We'd love to hear from you"
        intro="Ask a question, or book a time to walk the campus with us. All contact details on this sample site are placeholders."
        image="/images/contact.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Contact", href: "/contact" },
        ]}
      />
      <section className="container-site grid gap-14 py-16 lg:grid-cols-[1.4fr_1fr] lg:py-20">
        <div className="rounded-lg border border-line bg-elevated p-6 shadow-soft sm:p-10">
          <Tabs defaultValue={tab === "tour" ? "tour" : "general"}>
            <TabsList>
              <TabsTrigger value="general">General enquiry</TabsTrigger>
              <TabsTrigger value="tour">Campus tour</TabsTrigger>
            </TabsList>
            <TabsContent value="general">
              <EnquiryForm source="contact" />
            </TabsContent>
            <TabsContent value="tour">
              <EnquiryForm source="contact-tour" type="TOUR" />
            </TabsContent>
          </Tabs>
        </div>
        <div className="space-y-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {cards.map((c) => (
              <li key={c.title} className="rounded-lg border border-line p-5">
                <c.icon className="size-5 text-kiln-700" aria-hidden />
                <p className="mt-3 font-medium">{c.title}</p>
                {c.lines.map((l, i) =>
                  c.href && i === 0 ? (
                    <a
                      key={l}
                      href={c.href}
                      className="block text-sm text-damson-800 underline underline-offset-2"
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                    >
                      {l}
                    </a>
                  ) : (
                    <p key={l} className="text-sm text-muted">
                      {l}
                    </p>
                  ),
                )}
              </li>
            ))}
          </ul>
          <div>
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-kiln-700" aria-hidden />
              <span>{school.contact.address.join(", ")}</span>
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-line">
              {map.mode === "google" ? (
                <iframe
                  title={map.label}
                  src={map.embedUrl}
                  className="aspect-[4/3] w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <a
                  href={map.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block aspect-[4/3]"
                >
                  <Image
                    src={map.image}
                    alt={`${map.label} (illustrative placeholder). Opens a map in a new tab.`}
                    fill
                    sizes="(min-width: 1024px) 35vw, 100vw"
                    className="object-cover"
                  />
                  <span className="absolute right-3 bottom-3 rounded-full bg-paper px-3 py-1.5 text-sm font-medium shadow-soft group-hover:bg-cream">
                    Open in maps ↗
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
