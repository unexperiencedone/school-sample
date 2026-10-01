/**
 * Single analytics entry point. Providers (GTM, GA4, Meta Pixel, LinkedIn, Clarity) are env-driven, off by default,
 * and only loaded after the visitor opts in via the cookie banner. Call `track()` anywhere; it is a no-op without consent.
 */
export type AnalyticsEvent =
  | "lead_submit"
  | "tour_book"
  | "registration_start"
  | "payment_start"
  | "payment_success"
  | "whatsapp_click"
  | "brochure_download"
  | "vacancy_apply"
  | "newsletter_signup";

export type Consent = { analytics: boolean; marketing: boolean; decidedAt: string };

export const CONSENT_COOKIE = "ah_consent";
export const UTM_COOKIE = "ah_utm";

type W = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  lintrk?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function writeCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function getConsent(): Consent | null {
  try {
    const raw = readCookie(CONSENT_COOKIE);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

export function track(
  event: AnalyticsEvent,
  props: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === "undefined") return;
  const consent = getConsent();
  const w = window as W;
  if (consent?.analytics) {
    w.dataLayer?.push({ event, ...props });
    w.gtag?.("event", event, props);
    w.clarity?.("event", event);
  }
  if (consent?.marketing) {
    const conversion = event === "lead_submit" || event === "tour_book" || event === "payment_success";
    if (conversion) {
      w.fbq?.("track", event === "payment_success" ? "Purchase" : "Lead", props);
      w.lintrk?.("track", { conversion_id: event });
    }
  }
  if (process.env.NODE_ENV === "development")
    console.debug("[analytics]", event, props, consent ? "" : "(no consent — not sent)");
}

export type Utm = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
};

/** First-touch attribution: stored once for 90 days (strictly necessary for answering the enquiry, not tracking). */
export function captureUtm() {
  if (typeof window === "undefined" || readCookie(UTM_COOKIE)) return;
  const p = new URLSearchParams(location.search);
  const utm: Utm = {
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    utmTerm: p.get("utm_term") ?? undefined,
    utmContent: p.get("utm_content") ?? undefined,
    referrer:
      document.referrer && !document.referrer.startsWith(location.origin)
        ? document.referrer.slice(0, 500)
        : undefined,
    landingPage: location.pathname.slice(0, 300),
  };
  writeCookie(UTM_COOKIE, JSON.stringify(utm), 90);
}

export function getUtm(): Utm {
  try {
    return JSON.parse(readCookie(UTM_COOKIE) ?? "{}") as Utm;
  } catch {
    return {};
  }
}
