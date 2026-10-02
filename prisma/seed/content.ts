import type { PrismaClient } from "@prisma/client";
import events from "../../content/events.json";
import announcements from "../../content/announcements.json";
import { utc } from "./core";

/** Events, announcement bar and parent circulars (DB-owned after seeding; edited in CRM › Content). */
export async function seedContent(db: PrismaClient, users: Record<string, string>) {
  for (const e of events) {
    await db.event.create({
      data: {
        slug: e.slug,
        title: e.title,
        kind: e.kind as "OPEN_HOUSE",
        summary: e.summary,
        description: e.description,
        location: e.location,
        startsAt: new Date(e.startsAt),
        endsAt: new Date(e.endsAt),
        showInModal: e.showInModal,
      },
    });
  }
  for (const [i, a] of announcements.entries()) {
    await db.announcement.create({
      data: {
        kind: "BAR",
        title: a.title,
        body: a.body,
        href: a.href,
        order: i,
        createdById: users.ADMISSIONS,
      },
    });
  }
  const circulars = [
    [
      "Autumn half-term dates",
      "Half-term runs from Friday 23 October to Sunday 1 November (sample dates). Boarders may travel from 3 pm on Friday; the school bus to the station leaves at 3:30 pm.\n\nPlease confirm travel plans with your houseparent by 16 October.",
      utc(2026, 9, 28),
    ],
    [
      "Parent–teacher meetings: Upper School",
      "Parent–teacher meetings for Years 7–11 will take place on Saturday 17 October (sample). Book ten-minute slots with each subject teacher through the link in the parent portal from Monday.",
      utc(2026, 9, 21),
    ],
    [
      "Annual health check-up",
      "The medical centre will run annual health check-ups for all pupils between 5 and 9 October (sample). Please update allergies and medication in the portal beforehand.",
      utc(2026, 9, 14),
    ],
    [
      "Fee reminder: Autumn term instalment",
      "The Autumn term instalment was due on 10 September. If you have already paid, thank you. You can pay online from the parent portal or by bank transfer quoting your daughter's admission number.",
      utc(2026, 9, 12),
    ],
    [
      "Welcome back!",
      "We are delighted to welcome everyone back for the Monsoon term, including 34 new girls (sample figure). Term begins on 3 April for boarders and 4 April for day pupils.",
      utc(2026, 3, 28),
    ],
  ] as const;
  for (const [title, body, at] of circulars) {
    await db.announcement.create({
      data: { kind: "CIRCULAR", title, body, publishedAt: at, createdById: users.PRINCIPAL },
    });
  }
}

/** A handful of portal requests in different states, including one from the demo parent (already answered). */
export async function seedPortalRequests(db: PrismaClient, users: Record<string, string>, today: Date) {
  const day = 86_400_000;
  const demo = await db.guardian.findFirstOrThrow({
    where: { userId: users.PARENT },
    include: { students: { include: { student: true }, orderBy: { student: { dob: "asc" } } } },
  });
  const ira = demo.students[0]!.student;
  await db.portalRequest.create({
    data: {
      kind: "PROFILE_UPDATE",
      studentId: ira.id,
      guardianId: demo.id,
      payload: { address: "22 Sample Street, Pune 000000 (sample)", note: "We moved in August" },
      status: "APPROVED",
      response: "Updated on our records — thank you. (sample)",
      handledById: users.REGISTRAR,
      createdAt: new Date(today.getTime() - 20 * day),
    },
  });
  const others = await db.studentGuardian.findMany({
    where: { isPrimary: true, guardian: { userId: null }, student: { status: "ACTIVE" } },
    include: { student: true },
    take: 3,
    skip: 17,
  });
  const [a, b, c] = others;
  if (a)
    await db.portalRequest.create({
      data: {
        kind: "WITHDRAWAL",
        studentId: a.studentId,
        guardianId: a.guardianId,
        payload: {
          lastDay: new Date(today.getTime() + 75 * day).toISOString().slice(0, 10),
          reason: "Family relocating to Singapore for work (sample)",
          destination: "International school, Singapore",
        },
        status: "OPEN",
        createdAt: new Date(today.getTime() - 2 * day),
      },
    });
  if (b)
    await db.portalRequest.create({
      data: {
        kind: "CONCESSION",
        studentId: b.studentId,
        guardianId: b.guardianId,
        payload: {
          kind: "Music, art or sport scholarship",
          reason: "Selected for the state under-14 hockey squad; coach's letter available (sample)",
        },
        status: "IN_REVIEW",
        response: "Thank you — the Head of Sport will meet you after the tournament. (sample)",
        handledById: users.PRINCIPAL,
        createdAt: new Date(today.getTime() - 6 * day),
      },
    });
  if (c)
    await db.portalRequest.create({
      data: {
        kind: "PROFILE_UPDATE",
        studentId: c.studentId,
        guardianId: c.guardianId,
        payload: { phone: "+91 90000 00000", note: "New mobile number (sample)" },
        status: "OPEN",
        createdAt: new Date(today.getTime() - 1 * day),
      },
    });
}
