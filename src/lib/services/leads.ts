import "server-only";
import type { Lead, LeadStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { dobFromParts } from "@/lib/schemas/common";
import type { LeadData } from "@/lib/schemas/lead";
import { emitLeadEvent, sendTemplate } from "@/lib/notify";
import { formatDate } from "@/lib/dates";
import { TOUR_SLOTS } from "@/lib/schemas/lead";

export const LEAD_STATUS_FLOW: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "TOUR_BOOKED",
  "TOUR_DONE",
  "APPLIED",
  "ADMITTED",
  "LOST",
];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  TOUR_BOOKED: "Tour booked",
  TOUR_DONE: "Tour done",
  APPLIED: "Applied",
  ADMITTED: "Admitted",
  LOST: "Lost",
};

/** Where on the website (or off it) an enquiry came from, for people rather than databases. */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  drawer: "Enquiry drawer",
  admissions: "Admissions page",
  contact: "Contact page",
  "contact-tour": "Contact page tour",
  "event-modal": "Event pop-up",
  "book-a-tour": "Book a tour page",
  "walk-in": "Walk-in",
  phone: "Phone call",
};

export const sourceLabel = (source: string) => LEAD_SOURCE_LABEL[source] ?? source;

export const TOUR_SLOT_CAPACITY = 6;

export function leadRef(lead: Pick<Lead, "id" | "createdAt">): string {
  return `ENQ-${lead.createdAt.getUTCFullYear().toString().slice(2)}${lead.id.slice(-6).toUpperCase()}`;
}

/** Finds or creates the tour slot for a date + time (IST) and checks capacity. */
async function reserveSlot(tx: Prisma.TransactionClient, date: string, time: string, visitors: number) {
  const startsAt = new Date(`${date}T${time}:00+05:30`);
  const endsAt = new Date(startsAt.getTime() + 75 * 60_000);
  const label = TOUR_SLOTS.find((s) => s.value === time)?.label ?? time;
  const slot =
    (await tx.tourSlot.findFirst({ where: { startsAt } })) ??
    (await tx.tourSlot.create({
      data: { startsAt, endsAt, capacity: TOUR_SLOT_CAPACITY, label: `Campus tour, ${label}` },
    }));
  const booked = await tx.tourBooking.count({
    where: { slotId: slot.id, status: { in: ["BOOKED", "CHECKED_IN"] } },
  });
  if (booked >= slot.capacity)
    throw new ApiError(409, "SLOT_FULL", "That time is fully booked. Please choose another time or date.", {
      fieldErrors: { preferredSlot: ["Fully booked — please choose another time"] },
    });
  return { slot, label: `${formatDate(startsAt, "EEEE d MMMM")} at ${label}`, visitors };
}

/** Creates a lead (and tour booking) from a validated public form. Returns a human reference. */
export async function createLeadFromForm(
  data: LeadData,
): Promise<{ lead: Lead; ref: string; tour?: string; duplicate: boolean }> {
  // Double-submit protection: identical submission within 2 minutes returns the existing lead.
  const recent = await db.lead.findFirst({
    where: {
      email: data.email,
      classApplying: data.classApplying,
      type: data.type,
      createdAt: { gt: new Date(Date.now() - 120_000) },
    },
    orderBy: { createdAt: "desc" },
    include: { bookings: { include: { slot: true } } },
  });
  if (recent) {
    const b = recent.bookings[0];
    return {
      lead: recent,
      ref: leadRef(recent),
      tour: b ? formatDate(b.slot.startsAt, "EEEE d MMMM, h:mm a") : undefined,
      duplicate: true,
    };
  }

  const childDob = dobFromParts(data.dobDay, data.dobMonth, data.dobYear);
  const utm = data.utm ?? {};

  const { lead, tour } = await db.$transaction(async (tx) => {
    let tour: { slot: { id: string }; label: string; visitors: number } | undefined;
    if (data.type === "TOUR")
      tour = await reserveSlot(tx, data.preferredDate, data.preferredSlot, data.visitors);
    const lead = await tx.lead.create({
      data: {
        type: data.type,
        source: data.source,
        status: data.type === "TOUR" ? "TOUR_BOOKED" : "NEW",
        parentName: data.parentName,
        phone: data.phone,
        email: data.email,
        childName: data.childName || null,
        childDob,
        classApplying: data.classApplying,
        preferredBoarding: data.preferredBoarding,
        message: data.message || null,
        consent: true,
        consentAt: new Date(),
        ...utm,
        activities: {
          create: {
            kind: "CREATED",
            body: `${data.type === "TOUR" ? "Tour booked" : "Enquiry received"} via ${data.source}${data.eventSlug ? ` (${data.eventSlug})` : ""}`,
            meta: { source: data.source, utm } as Prisma.InputJsonValue,
          },
        },
      },
    });
    if (tour)
      await tx.tourBooking.create({
        data: { slotId: tour.slot.id, leadId: lead.id, visitors: tour.visitors },
      });
    return { lead, tour };
  });

  const ref = leadRef(lead);
  const contact = {
    email: lead.email,
    phone: lead.phone,
    consent: { email: true, whatsapp: true, sms: false },
  };
  if (tour) {
    await sendTemplate({
      template: "tour-confirmation",
      to: contact,
      data: {
        parentName: lead.parentName,
        date: tour.label.split(" at ")[0],
        time: tour.label.split(" at ")[1],
        visitors: tour.visitors,
      },
      related: { type: "lead", id: lead.id },
    });
  } else {
    await sendTemplate({
      template: "enquiry-received",
      to: contact,
      data: { parentName: lead.parentName, ref, classApplying: lead.classApplying },
      related: { type: "lead", id: lead.id },
    });
  }
  await emitLeadEvent(tour ? "tour.booked" : "lead.created", {
    leadId: lead.id,
    status: lead.status,
    source: lead.source,
    parent: { name: lead.parentName, email: lead.email, phone: lead.phone },
    child: {
      name: lead.childName ?? undefined,
      dob: childDob?.toISOString().slice(0, 10),
      classApplying: lead.classApplying,
      boarding: lead.preferredBoarding ?? undefined,
    },
    utm,
  });
  return { lead, ref, tour: tour?.label, duplicate: false };
}

/** Possible duplicates: same email or phone (digits) among un-merged leads. */
export async function findDuplicates(lead: Pick<Lead, "id" | "email" | "phone">) {
  const digits = lead.phone.replace(/\D/g, "").slice(-10);
  return db.lead.findMany({
    where: {
      id: { not: lead.id },
      mergedIntoId: null,
      OR: [{ email: lead.email }, { phone: { contains: digits } }],
    },
    orderBy: { createdAt: "asc" },
  });
}
