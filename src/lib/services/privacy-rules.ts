import { z } from "zod";
import { reasonSchema } from "./settings-rules";

/**
 * Pure rules for privacy requests: how a request is resolved, which phone forms identify a person in the message
 * log, and the sample erase-versus-retain policy shown for deletion requests. Nothing is ever erased automatically.
 */

export const REQUEST_STATUSES = ["OPEN", "DONE", "REJECTED"] as const;
export const REQUEST_KINDS = ["EXPORT", "DELETION"] as const;

export const resolveRequestSchema = z.object({
  status: z.enum(["DONE", "REJECTED"]),
  notes: reasonSchema,
});

const NOTES_MAX = 2000;

/** Keeps what the person wrote and adds who handled it and how, so the request carries its own history. */
export function appendHandlerNote(
  existing: string | null,
  handler: string,
  status: "DONE" | "REJECTED",
  notes: string,
): string {
  const line = `[${status === "DONE" ? "Done" : "Rejected"} by ${handler}] ${notes}`;
  const combined = existing?.trim() ? `${existing.trim()}\n\n${line}` : line;
  return combined.length > NOTES_MAX ? combined.slice(combined.length - NOTES_MAX) : combined;
}

/** The forms a mobile number takes in the message log: digits as typed, and with the country code in front. */
export function phoneKeys(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  return [...new Set([digits, digits.length === 10 ? `91${digits}` : digits])];
}

export const RETENTION_YEARS = 8;
/** Sample retention for a submitted staff application, counted from the vacancy closing (or from submission, for a general application). */
export const STAFF_APPLICATION_RETENTION_MONTHS = 12;

export type PolicyKey =
  | "account"
  | "guardianContact"
  | "enquiries"
  | "newsletter"
  | "draftApplications"
  | "staffDrafts"
  | "invoices"
  | "payments"
  | "pupilRecord"
  | "applications"
  | "staffApplications"
  | "auditLog";

export type PolicyItem = { key: PolicyKey; label: string; detail: string };

/** Sample policy for demonstration. A real school confirms retention periods with its legal adviser. */
export const DELETION_POLICY: { erase: PolicyItem[]; retain: PolicyItem[] } = {
  erase: [
    {
      key: "account",
      label: "Portal sign-in account",
      detail: "The login and any saved views. Sign-in stops working at once.",
    },
    {
      key: "guardianContact",
      label: "Contact details on the guardian record",
      detail: "Phone, address and occupation are cleared once no enrolled pupil depends on them.",
    },
    {
      key: "enquiries",
      label: "Enquiries (leads)",
      detail: "Admissions enquiries made with this email address.",
    },
    {
      key: "newsletter",
      label: "Newsletter subscription",
      detail: "The address is removed from the mailing list.",
    },
    {
      key: "draftApplications",
      label: "Unsubmitted application drafts",
      detail: "Drafts that never reached the school.",
    },
    {
      key: "staffDrafts",
      label: "Unsubmitted staff application drafts",
      detail:
        "Drafts of a job application that never reached HR, with the personal, family and referee details typed so far. They stop being resumable after 14 days but stay in the database until a person erases them.",
    },
  ],
  retain: [
    {
      key: "invoices",
      label: "Fee invoices and instalments",
      detail: `Kept for ${RETENTION_YEARS} years for accounting and tax (sample policy).`,
    },
    {
      key: "payments",
      label: "Payments, receipts and refunds",
      detail: `Kept for ${RETENTION_YEARS} years for accounting and tax (sample policy).`,
    },
    {
      key: "pupilRecord",
      label: "The pupil's school record",
      detail:
        "Admission and academic history stay on the pupil's own record, which the pupil's family may still need.",
    },
    {
      key: "applications",
      label: "Submitted admissions applications",
      detail: "Kept with the pupil record, or for the admission cycle when no place was taken up.",
    },
    {
      key: "staffApplications",
      label: "Submitted staff applications",
      detail: `Kept for ${STAFF_APPLICATION_RETENTION_MONTHS} months after the vacancy closes (from submission, for a general application) so the school can answer a challenge to a hiring decision (sample policy).`,
    },
    {
      key: "auditLog",
      label: "Audit log entries",
      detail: "The security trail of who did what is kept so the school can show its work.",
    },
  ],
};

export const DELETION_NOTE =
  "This is a sample policy for demonstration, not legal advice. Nothing is erased automatically: a person carries out the erasure and then marks the request done.";
