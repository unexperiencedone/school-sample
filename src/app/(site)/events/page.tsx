import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { PageHero } from "@/components/site/blocks";
import { JsonLd } from "@/components/site/json-ld";
import { getUpcomingEvents } from "@/lib/content";
import { formatDate } from "@/lib/dates";
import { pageMetadata } from "@/lib/seo/metadata";
import { school, siteUrl } from "@/config/school";

export const metadata = pageMetadata({
  title: "Events & Open Mornings",
  description: "Open Mornings, information evenings and school events open to prospective families.",
  path: "/events",
  image: "/images/events.webp",
});
export const revalidate = 300;

const KIND: Record<string, string> = {
  OPEN_HOUSE: "Open Morning",
  ADMISSIONS_TALK: "Information evening",
  SCHOOL_EVENT: "School event",
  CAMPUS_TOUR: "Campus tour",
};

export default async function EventsPage() {
  const events = await getUpcomingEvents();
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const k = formatDate(e.startsAt, "MMMM yyyy");
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }
  return (
    <>
      <JsonLd
        data={events.map((e) => ({
          "@context": "https://schema.org",
          "@type": "Event",
          name: e.title,
          description: e.summary,
          startDate: e.startsAt,
          endDate: e.endsAt,
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "Place",
            name: `${e.location}, ${school.name}`,
            address: school.contact.address.join(", "),
          },
          organizer: { "@type": "Organization", name: school.name, url: siteUrl() },
        }))}
      />
      <PageHero
        eyebrow="Calendar"
        title="Events & Open Mornings"
        intro="Prospective families are warmly welcome at all of these. Register and we'll save you a place."
        image="/images/events.webp"
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Events", href: "/events" },
        ]}
      />
      <section className="container-site py-16">
        {[...byMonth].map(([month, list]) => (
          <div key={month} className="grid gap-6 border-t border-line py-10 lg:grid-cols-[14rem_1fr]">
            <h2 className="font-serif text-2xl text-kiln-700">{month}</h2>
            <ul className="space-y-6">
              {list.map((e) => (
                <li
                  key={e.slug}
                  id={e.slug}
                  data-reveal
                  className="grid scroll-mt-28 gap-6 rounded-lg border border-line bg-elevated p-6 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                >
                  <div className="text-center">
                    <p className="font-serif text-5xl leading-none text-primary">
                      {formatDate(e.startsAt, "d")}
                    </p>
                    <p className="text-xs tracking-widest text-muted uppercase">
                      {formatDate(e.startsAt, "EEE")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-kiln-700 uppercase">
                      {KIND[e.kind] ?? e.kind}
                    </p>
                    <h3 className="mt-1 font-serif text-2xl text-primary">{e.title}</h3>
                    <p className="mt-1 text-muted">{e.summary}</p>
                    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-4 text-kiln-700" aria-hidden />
                        {formatDate(e.startsAt, "h:mm a")} – {formatDate(e.endsAt, "h:mm a")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4 text-kiln-700" aria-hidden />
                        {e.location}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/contact?tab=tour&event=${e.slug}`}
                    className="justify-self-start rounded-full bg-damson-800 px-5 py-2.5 text-sm font-semibold text-paper hover:bg-damson-700 sm:justify-self-end"
                  >
                    Register
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
