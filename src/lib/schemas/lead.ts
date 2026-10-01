import { z } from "zod";
import { ageOn } from "@/lib/dates";
import {
  BOARDING_OPTIONS,
  captchaFields,
  CLASS_OPTIONS,
  dobFromParts,
  email,
  personName,
  phone,
  utmSchema,
} from "./common";

export const LEAD_SOURCES = [
  "drawer",
  "admissions",
  "contact",
  "contact-tour",
  "event-modal",
  "book-a-tour",
  "header",
  "mobile-menu",
  "home",
  "walk-in",
  "phone",
] as const;
export const TOUR_SLOTS = [
  { value: "09:30", label: "9:30 am" },
  { value: "11:30", label: "11:30 am" },
  { value: "14:30", label: "2:30 pm" },
] as const;

const base = z.object({
  source: z.enum(LEAD_SOURCES),
  parentName: personName,
  phone,
  email,
  childName: z.string().trim().max(100).optional().or(z.literal("")),
  dobDay: z.string().optional(),
  dobMonth: z.string().optional(),
  dobYear: z.string().optional(),
  classApplying: z.enum(CLASS_OPTIONS, { errorMap: () => ({ message: "Choose a class" }) }),
  preferredBoarding: z.enum(BOARDING_OPTIONS.map((b) => b.value) as [string, ...string[]]).default("unsure"),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree so we can contact you" }) }),
  eventSlug: z.string().max(100).optional(),
  utm: utmSchema.optional(),
  ...captchaFields,
});

const dobRefine = <T extends { dobDay?: string; dobMonth?: string; dobYear?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  const parts = [v.dobDay, v.dobMonth, v.dobYear].filter(Boolean).length;
  if (parts === 0) return;
  const dob = dobFromParts(v.dobDay, v.dobMonth, v.dobYear);
  if (!dob)
    return ctx.addIssue({ code: "custom", path: ["dobDay"], message: "Choose a full, valid date of birth" });
  const age = ageOn(dob, new Date());
  if (age < 2 || age > 18)
    ctx.addIssue({
      code: "custom",
      path: ["dobYear"],
      message: "Date of birth should be for a child aged 2–18",
    });
};

export const enquirySchema = base.extend({ type: z.literal("ENQUIRY") });

export const tourSchema = base.extend({
  type: z.literal("TOUR"),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return d > today && d.getUTCDay() !== 0;
    }, "Choose a future weekday or Saturday"),
  preferredSlot: z.enum(TOUR_SLOTS.map((s) => s.value) as [string, ...string[]], {
    errorMap: () => ({ message: "Choose a time" }),
  }),
  visitors: z.coerce.number().int().min(1).max(4),
});

export const leadSchema = z.discriminatedUnion("type", [enquirySchema, tourSchema]).superRefine(dobRefine);

export type LeadInput = z.input<typeof leadSchema>;
export type LeadData = z.output<typeof leadSchema>;

export const newsletterSchema = z.object({ email, consent: z.literal(true), website: captchaFields.website });
