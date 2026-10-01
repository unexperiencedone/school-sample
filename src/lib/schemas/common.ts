import { z } from "zod";

export const INDIAN_PHONE = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

export const phone = z
  .string()
  .trim()
  .regex(INDIAN_PHONE, "Enter a 10-digit Indian mobile number, e.g. +91 98765 43210");

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);

export const personName = z.string().trim().min(2, "Please enter a name").max(100);

export const CLASS_OPTIONS = [
  "Nursery",
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
] as const;

export const BOARDING_OPTIONS = [
  { value: "full", label: "Full boarding" },
  { value: "flexi", label: "Flexi boarding" },
  { value: "day", label: "Day boarding" },
  { value: "unsure", label: "Not sure yet" },
] as const;

export const captchaFields = {
  captchaToken: z.string().max(4000).optional(),
  captchaAnswer: z.string().max(200).optional(),
  /** Honeypot: real users never see or fill this. Validated loosely so bots get a normal-looking success. */
  website: z.string().max(500).optional(),
};

export const utmSchema = z
  .object({
    utmSource: z.string().max(100).optional(),
    utmMedium: z.string().max(100).optional(),
    utmCampaign: z.string().max(150).optional(),
    utmTerm: z.string().max(150).optional(),
    utmContent: z.string().max(150).optional(),
    referrer: z.string().max(500).optional(),
    landingPage: z.string().max(500).optional(),
  })
  .partial();

/** Day/month/year selects → Date, validating real calendar dates and an age range. */
export function dobFromParts(day?: string, month?: string, year?: string): Date | null {
  if (!day || !month || !year) return null;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (d.getUTCDate() !== Number(day) || d.getUTCMonth() !== Number(month) - 1) return null;
  return d;
}
