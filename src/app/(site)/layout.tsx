import { AnnouncementBar } from "@/components/site/announcement-bar";
import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { EnquiryProvider } from "@/components/site/enquiry-context";
import { EventModal } from "@/components/site/event-modal";
import { WhatsAppButton } from "@/components/site/whatsapp-button";
import { ConsentManager } from "@/components/site/consent";
import { RevealObserver } from "@/components/site/reveal";
import { JsonLd, schoolJsonLd } from "@/components/site/json-ld";
import { DemoRibbon } from "@/components/demo-ribbon";
import { getAnnouncementBar, getModalEvent } from "@/lib/content";

export const revalidate = 300;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [bar, modalEvent] = await Promise.all([getAnnouncementBar(), getModalEvent()]);
  return (
    <EnquiryProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-damson-800 focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>
      <AnnouncementBar items={bar} />
      <Header />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <Footer />
      <EventModal event={modalEvent} />
      <WhatsAppButton />
      <ConsentManager />
      <RevealObserver />
      <DemoRibbon />
      <JsonLd data={schoolJsonLd()} />
    </EnquiryProvider>
  );
}
