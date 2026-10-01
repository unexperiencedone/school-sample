import "server-only";
import type { BookingStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendTemplate } from "@/lib/notify";
import { formatDate } from "@/lib/dates";

type Actor = { id: string; role: Role };

export async function upcomingSlots(days = 21) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return db.tourSlot.findMany({
    where: { startsAt: { gte: from, lte: new Date(Date.now() + days * 86400_000) } },
    include: { event: true, bookings: { include: { lead: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { startsAt: "asc" },
  });
}

/** Creates slots for each date × time (IST). Skips ones that already exist. */
export async function createSlots(
  actor: Actor,
  input: { dates: string[]; times: string[]; capacity: number; label: string },
) {
  let created = 0;
  for (const d of input.dates) {
    for (const t of input.times) {
      const startsAt = new Date(`${d}T${t}:00+05:30`);
      if (Number.isNaN(startsAt.getTime()))
        throw new ApiError(422, "BAD_DATE", `Invalid date/time ${d} ${t}`);
      if (await db.tourSlot.findFirst({ where: { startsAt } })) continue;
      await db.tourSlot.create({
        data: {
          startsAt,
          endsAt: new Date(startsAt.getTime() + 75 * 60_000),
          capacity: input.capacity,
          label: input.label,
        },
      });
      created++;
    }
  }
  await audit({ actor, action: "tour.slots_created", entity: "TourSlot", after: { ...input, created } });
  return created;
}

export async function setBookingStatus(actor: Actor, bookingId: string, status: BookingStatus) {
  const booking = await db.tourBooking.update({
    where: { id: bookingId },
    data: { status, checkedInAt: status === "CHECKED_IN" ? new Date() : null },
    include: { lead: true },
  });
  if (status === "CHECKED_IN" && ["NEW", "CONTACTED", "TOUR_BOOKED"].includes(booking.lead.status)) {
    await db.lead.update({
      where: { id: booking.leadId },
      data: {
        status: "TOUR_DONE",
        activities: { create: { kind: "TOUR", actorId: actor.id, body: "Checked in for campus tour" } },
      },
    });
  } else {
    await db.leadActivity.create({
      data: {
        leadId: booking.leadId,
        actorId: actor.id,
        kind: "TOUR",
        body: `Tour booking marked ${status.toLowerCase().replace("_", " ")}`,
      },
    });
  }
  return booking;
}

/** Cron: reminder the day before (once per booking). */
export async function sendTourReminders(now = new Date()) {
  const start = new Date(now.getTime() + 12 * 3600_000);
  const end = new Date(now.getTime() + 36 * 3600_000);
  const bookings = await db.tourBooking.findMany({
    where: { status: "BOOKED", reminderSentAt: null, slot: { startsAt: { gte: start, lte: end } } },
    include: { lead: true, slot: true },
  });
  for (const b of bookings) {
    await sendTemplate({
      template: "tour-reminder",
      to: { email: b.lead.email, phone: b.lead.phone },
      data: {
        parentName: b.lead.parentName,
        date: formatDate(b.slot.startsAt, "EEEE d MMMM"),
        time: formatDate(b.slot.startsAt, "h:mm a"),
      },
      related: { type: "lead", id: b.leadId },
    });
    await db.tourBooking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
  }
  return bookings.length;
}
