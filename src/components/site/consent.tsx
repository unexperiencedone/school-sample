"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, captureUtm, getConsent, writeCookie, type Consent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

const IDS = {
  gtm: process.env.NEXT_PUBLIC_GTM_ID,
  ga4: process.env.NEXT_PUBLIC_GA4_ID,
  pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  linkedin: process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
  clarity: process.env.NEXT_PUBLIC_CLARITY_ID,
};

/** Cookie banner with granular choices. Nothing third-party loads until the visitor opts in. */
export function ConsentManager() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    captureUtm();
    setConsent(getConsent());
    setReady(true);
    const reopen = () => {
      setConsent(null);
      setCustom(true);
    };
    window.addEventListener("open-cookie-settings", reopen);
    return () => window.removeEventListener("open-cookie-settings", reopen);
  }, []);

  const save = (c: Omit<Consent, "decidedAt">) => {
    const value = { ...c, decidedAt: new Date().toISOString() };
    writeCookie(CONSENT_COOKIE, JSON.stringify(value), 180);
    setConsent(value);
  };

  return (
    <>
      {consent?.analytics && IDS.gtm && (
        <Script
          id="gtm"
          strategy="afterInteractive"
        >{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${IDS.gtm}');`}</Script>
      )}
      {consent?.analytics && IDS.ga4 && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${IDS.ga4}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga4"
            strategy="afterInteractive"
          >{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${IDS.ga4}',{anonymize_ip:true});`}</Script>
        </>
      )}
      {consent?.analytics && IDS.clarity && (
        <Script
          id="clarity"
          strategy="afterInteractive"
        >{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${IDS.clarity}");`}</Script>
      )}
      {consent?.marketing && IDS.pixel && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
        >{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${IDS.pixel}');fbq('track','PageView');`}</Script>
      )}
      {consent?.marketing && IDS.linkedin && (
        <Script
          id="linkedin"
          strategy="afterInteractive"
        >{`window._linkedin_partner_id="${IDS.linkedin}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(window._linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}</Script>
      )}

      {ready && !consent && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-title"
          className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-line bg-elevated p-5 shadow-lift sm:inset-x-6 sm:bottom-6"
        >
          <p id="cookie-title" className="font-serif text-xl text-primary">
            Cookies, briefly
          </p>
          <p className="mt-1.5 text-sm text-muted">
            We use essential cookies to make this site work. With your permission we&apos;d also use analytics
            to improve it, and marketing cookies to measure our admissions campaigns. You can change this any
            time from the footer.
          </p>
          {custom && (
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="sr-only">Cookie choices</legend>
              <label className="flex items-center gap-2 text-muted">
                <input type="checkbox" checked disabled className="size-4" /> Essential (always on)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                />{" "}
                Analytics
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                />{" "}
                Marketing
              </label>
            </fieldset>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save({ analytics: true, marketing: true })}>
              Accept all
            </Button>
            <Button size="sm" variant="outline" onClick={() => save({ analytics: false, marketing: false })}>
              Essential only
            </Button>
            {custom ? (
              <Button size="sm" variant="ghost" onClick={() => save({ analytics, marketing })}>
                Save choices
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setCustom(true)}>
                Choose
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}
    >
      Cookie settings
    </button>
  );
}
