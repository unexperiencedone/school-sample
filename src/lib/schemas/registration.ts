import { z } from "zod";
import { ageOn } from "@/lib/dates";
import { dobFromParts, email, personName, phone } from "./common";

/** Registration wizard schemas, one per step, shared by the client form and the API. */

export const childStep = z
  .object({
    childFirstName: personName,
    childLastName: personName,
    dobDay: z.string().min(1, "Day"),
    dobMonth: z.string().min(1, "Month"),
    dobYear: z.string().min(1, "Year"),
    gender: z.enum(["FEMALE", "OTHER"]).default("FEMALE"),
    currentSchool: z.string().trim().max(150).optional().or(z.literal("")),
    classId: z.string().min(1, "Choose a class"),
    startYearId: z.string().min(1, "Choose a start session"),
  })
  .superRefine((v, ctx) => {
    const dob = dobFromParts(v.dobDay, v.dobMonth, v.dobYear);
    if (!dob)
      return ctx.addIssue({ code: "custom", path: ["dobDay"], message: "Enter a valid date of birth" });
    const age = ageOn(dob, new Date());
    if (age < 2 || age > 18)
      ctx.addIssue({
        code: "custom",
        path: ["dobYear"],
        message: "Date of birth should be for a child aged 2–18",
      });
  });

export const guardianSchema = z.object({
  relation: z.enum(["Mother", "Father", "Guardian"]),
  name: z.string().trim().max(100).optional().or(z.literal("")),
  occupation: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
});

export const parentsStep = z
  .object({
    guardians: z.array(guardianSchema).length(3),
    contactEmail: email,
    contactPhone: phone,
  })
  .superRefine((v, ctx) => {
    const filled = v.guardians.filter((g) => g.name);
    if (filled.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["guardians", 0, "name"],
        message: "Add at least one parent or guardian",
      });
    v.guardians.forEach((g, i) => {
      if (!g.name) return;
      if (g.name.length < 2)
        ctx.addIssue({ code: "custom", path: ["guardians", i, "name"], message: "Enter a full name" });
      if (!g.phone || !phone.safeParse(g.phone).success)
        ctx.addIssue({
          code: "custom",
          path: ["guardians", i, "phone"],
          message: "Enter a valid mobile number",
        });
      if (g.email && !email.safeParse(g.email).success)
        ctx.addIssue({ code: "custom", path: ["guardians", i, "email"], message: "Enter a valid email" });
      if (!g.address || g.address.length < 8)
        ctx.addIssue({
          code: "custom",
          path: ["guardians", i, "address"],
          message: "Enter the residential address",
        });
    });
  });

export const boardingStep = z.object({
  boardingType: z.enum(["FULL", "FLEXI", "DAY"], {
    errorMap: () => ({ message: "Choose a boarding option" }),
  }),
  scholarshipInterest: z.boolean().default(false),
});

export const declarationStep = z.object({
  declaration: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
  dataConsent: z.literal(true, {
    errorMap: () => ({ message: "Parental consent is required to process your daughter's data" }),
  }),
});

export const registrationDraftSchema = z.object({
  child: childStep,
  parents: parentsStep.optional(),
  boarding: boardingStep.optional(),
  utm: z.record(z.string().max(500)).optional(),
});

export type ChildStep = z.infer<typeof childStep>;
export type ParentsStep = z.infer<typeof parentsStep>;
export type BoardingStep = z.infer<typeof boardingStep>;
export type RegistrationDraft = z.infer<typeof registrationDraftSchema>;

export const DOCUMENT_KINDS = [
  { kind: "BIRTH_CERTIFICATE", label: "Birth certificate", hint: "PDF or photo, max 5 MB" },
  { kind: "REPORT_CARD", label: "Latest report card", hint: "PDF or photo, max 5 MB" },
  { kind: "PHOTO", label: "Passport-size photo", hint: "JPG or PNG" },
  { kind: "ID_PROOF", label: "Parent ID proof", hint: "Aadhaar, passport or similar" },
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["kind"];

export const uploadRequestSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS.map((d) => d.kind) as [DocumentKind, ...DocumentKind[]]),
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

/** Full boarding is offered from Year 5; flexi from Year 3 (class order ≥ 4); day boarding for everyone. */
export function boardingAllowed(classOrder: number, boarding: "FULL" | "FLEXI" | "DAY"): boolean {
  if (boarding === "FULL") return classOrder >= 6;
  if (boarding === "FLEXI") return classOrder >= 4;
  return true;
}
