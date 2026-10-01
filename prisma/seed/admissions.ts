import type { AcademicYear, ApplicationStage, ClassLevel, LeadStatus, PrismaClient } from "@prisma/client";
import { moveStageInTx } from "../../src/lib/services/admissions";
import { recordPayment } from "../../src/lib/services/ledger";
import { getStorage } from "../../src/integrations/storage";
import { ADULT_FEMALE, ADULT_MALE, GIRL_NAMES, SURNAMES } from "./names";
import type { Rng } from "./rng";
import { utc } from "./core";
import { SEED_TODAY } from "./finance";

type Years = { prev: AcademicYear; curr: AcademicYear; next: AcademicYear };
const day = 86400_000;

const SOURCES = [
  "drawer",
  "drawer",
  "admissions",
  "contact",
  "contact-tour",
  "event-modal",
  "book-a-tour",
  "book-a-tour",
  "walk-in",
  "phone",
];
const UTM: [string | null, string | null, string | null][] = [
  ["google", "cpc", "admissions-2027"],
  ["google", "cpc", "boarding-brand"],
  ["facebook", "paid_social", "open-morning-oct"],
  ["instagram", "social", null],
  ["newsletter", "email", "autumn-newsletter"],
  [null, null, null],
  [null, null, null],
  [null, null, null],
];
const STATUS_PLAN: [LeadStatus, number][] = [
  ["NEW", 10],
  ["CONTACTED", 10],
  ["TOUR_BOOKED", 8],
  ["TOUR_DONE", 8],
  ["APPLIED", 12],
  ["ADMITTED", 6],
  ["LOST", 6],
];
const LOST_REASONS = [
  "Chose a school closer to home",
  "Fees above budget",
  "Relocating abroad",
  "Wanted co-education",
  "No response after three attempts",
];

const MINI_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** 60 leads over eight months, in every pipeline stage, with activity timelines, tours, reminders and duplicates. */
export async function seedLeads(
  db: PrismaClient,
  rng: Rng,
  users: Record<string, string>,
  classes: ClassLevel[],
) {
  const classNames = classes.filter((c) => c.order <= 13).map((c) => c.name);
  const leads: {
    id: string;
    status: LeadStatus;
    email: string;
    phone: string;
    parentName: string;
    childName: string;
    classApplying: string;
    createdAt: Date;
  }[] = [];
  let i = 0;
  for (const [status, count] of STATUS_PLAN) {
    for (let k = 0; k < count; k++) {
      i++;
      const surname = rng.pick(SURNAMES);
      const parent = `${rng.pick([...ADULT_FEMALE, ...ADULT_MALE])} ${surname}`;
      const child = rng.pick(GIRL_NAMES);
      const createdAt = new Date(
        utc(2026, 2, 1).getTime() +
          Math.floor(((i * 233) % 240) * day * (status === "NEW" ? 0.12 : 1)) +
          rng.int(8, 20) * 3600_000,
      );
      const created =
        status === "NEW"
          ? new Date(SEED_TODAY.getTime() - rng.int(0, 9) * day - rng.int(1, 10) * 3600_000)
          : createdAt;
      const [utmSource, utmMedium, utmCampaign] = rng.pick(UTM);
      const source = rng.pick(SOURCES);
      const lead = await db.lead.create({
        data: {
          type: source.includes("tour") ? "TOUR" : "ENQUIRY",
          source,
          status,
          parentName: parent,
          phone: `+91 9${String(810000000 + i * 1931).slice(0, 9)}`,
          email: `${parent.split(" ")[0]!.toLowerCase()}.${surname.toLowerCase()}.${i}@example.com`,
          childName: child,
          childDob: utc(2026 - rng.int(4, 16), rng.int(1, 12), rng.int(1, 28)),
          classApplying: rng.pick(classNames),
          preferredBoarding: rng.pick(["full", "flexi", "day", "unsure"]),
          message: rng.chance(0.4)
            ? rng.pick([
                "Do you offer transport from the station?",
                "We are relocating from Dubai next year.",
                "Interested in the music scholarship.",
                "Can we visit on a Saturday?",
                "What is the class size in Year 7?",
              ])
            : null,
          consent: true,
          consentAt: created,
          utmSource,
          utmMedium,
          utmCampaign,
          landingPage: rng.pick([
            "/",
            "/admissions",
            "/boarding/full",
            "/admissions/fees/full-boarding",
            "/academics/upper-school",
          ]),
          assignedToId: status === "NEW" && rng.chance(0.5) ? null : users.ADMISSIONS,
          lostReason: status === "LOST" ? rng.pick(LOST_REASONS) : null,
          nextFollowUpAt: ["CONTACTED", "TOUR_DONE"].includes(status)
            ? new Date(SEED_TODAY.getTime() + rng.int(-3, 7) * day)
            : null,
          createdAt: created,
          updatedAt: new Date(created.getTime() + rng.int(1, 20) * day),
        },
      });
      leads.push({
        id: lead.id,
        status,
        email: lead.email,
        phone: lead.phone,
        parentName: parent,
        childName: child,
        classApplying: lead.classApplying,
        createdAt: created,
      });

      const acts: { kind: string; body: string; at: number; actor?: string }[] = [
        { kind: "CREATED", body: `Enquiry received via ${source}`, at: 0 },
      ];
      const flow: LeadStatus[] = ["CONTACTED", "TOUR_BOOKED", "TOUR_DONE", "APPLIED", "ADMITTED"];
      const reached =
        status === "LOST"
          ? flow.slice(0, rng.int(1, 3))
          : flow.slice(0, Math.max(0, flow.indexOf(status) + 1));
      reached.forEach((s, n) =>
        acts.push({
          kind: s === "CONTACTED" ? "CALL" : "STATUS",
          body:
            s === "CONTACTED"
              ? "Called parent — answered questions about boarding and fees"
              : `Status → ${s.replace("_", " ").toLowerCase()}`,
          at: (n + 1) * rng.int(2, 6),
          actor: users.ADMISSIONS,
        }),
      );
      if (status === "LOST")
        acts.push({
          kind: "STATUS",
          body: `Marked lost: ${lead.lostReason}`,
          at: 30,
          actor: users.ADMISSIONS,
        });
      for (const a of acts)
        await db.leadActivity.create({
          data: {
            leadId: lead.id,
            kind: a.kind,
            body: a.body,
            actorId: a.actor,
            createdAt: new Date(created.getTime() + a.at * day),
          },
        });

      if (["TOUR_BOOKED", "TOUR_DONE", "APPLIED", "ADMITTED"].includes(status)) {
        const future = status === "TOUR_BOOKED";
        const when = future
          ? new Date(SEED_TODAY.getTime() + rng.int(2, 18) * day)
          : new Date(created.getTime() + rng.int(4, 12) * day);
        const date = when.toISOString().slice(0, 10);
        const time = rng.pick(["09:30", "11:30", "14:30"]);
        const startsAt = new Date(`${date}T${time}:00+05:30`);
        const slot =
          (await db.tourSlot.findFirst({ where: { startsAt } })) ??
          (await db.tourSlot.create({
            data: {
              startsAt,
              endsAt: new Date(startsAt.getTime() + 75 * 60_000),
              capacity: 6,
              label: "Campus tour",
            },
          }));
        await db.tourBooking.create({
          data: {
            slotId: slot.id,
            leadId: lead.id,
            visitors: rng.int(1, 4),
            status: future ? "BOOKED" : "CHECKED_IN",
            checkedInAt: future ? null : startsAt,
            createdAt: created,
          },
        });
      }
      if (lead.nextFollowUpAt)
        await db.reminder.create({
          data: {
            leadId: lead.id,
            title: status === "TOUR_DONE" ? "Follow up after tour" : "Second call",
            dueAt: lead.nextFollowUpAt,
            assignedToId: users.ADMISSIONS,
          },
        });
    }
  }
  // Two duplicate pairs (same family enquiring twice)
  for (const original of rng.shuffle(leads.filter((l) => l.status === "CONTACTED")).slice(0, 2)) {
    await db.lead.create({
      data: {
        source: "event-modal",
        status: "NEW",
        parentName: original.parentName,
        phone: original.phone,
        email: original.email,
        childName: original.childName,
        classApplying: original.classApplying,
        consent: true,
        consentAt: SEED_TODAY,
        createdAt: new Date(SEED_TODAY.getTime() - rng.int(1, 4) * day),
        activities: { create: { kind: "CREATED", body: "Enquiry received via event-modal" } },
      },
    });
  }
  // Open tour slots for the next three weeks (Mon–Sat)
  for (let d = 1; d <= 21; d++) {
    const date = new Date(SEED_TODAY.getTime() + d * day);
    if (date.getUTCDay() === 0) continue;
    for (const time of ["09:30", "11:30", "14:30"]) {
      const startsAt = new Date(`${date.toISOString().slice(0, 10)}T${time}:00+05:30`);
      if (!(await db.tourSlot.findFirst({ where: { startsAt } })))
        await db.tourSlot.create({
          data: {
            startsAt,
            endsAt: new Date(startsAt.getTime() + 75 * 60_000),
            capacity: 6,
            label: "Campus tour",
          },
        });
    }
  }
  return leads;
}

const STAGE_PLAN: [ApplicationStage, number][] = [
  ["REGISTERED", 4],
  ["DOCUMENTS", 4],
  ["ASSESSMENT", 4],
  ["REVIEW", 3],
  ["OFFER", 2],
  ["FEE_PAID", 2],
  ["ADMITTED", 2],
  ["WAITLISTED", 2],
  ["REJECTED", 1],
];
const PATH: ApplicationStage[] = ["DOCUMENTS", "ASSESSMENT", "REVIEW", "OFFER", "FEE_PAID", "ADMITTED"];

/**
 * 25 applications (plus the demo applicant's) in every stage, built through the real admissions state machine
 * so timelines, provisional students and invoices are consistent. Email side effects are discarded.
 */
export async function seedApplications(
  db: PrismaClient,
  rng: Rng,
  years: Years,
  classes: ClassLevel[],
  users: Record<string, string>,
  leads: {
    id: string;
    status: LeadStatus;
    email: string;
    phone: string;
    parentName: string;
    childName: string;
    classApplying: string;
    createdAt: Date;
  }[],
) {
  const actor = { id: users.ADMISSIONS!, role: "ADMISSIONS" as const };
  const principal = { id: users.PRINCIPAL!, role: "PRINCIPAL" as const };
  const storage = getStorage();
  const appliedLeads = leads.filter((l) => l.status === "APPLIED" || l.status === "ADMITTED");
  let seq = 0;
  let paySeq = 0;
  const plan: { stage: ApplicationStage; demo?: boolean }[] = [
    { stage: "OFFER", demo: true },
    ...STAGE_PLAN.flatMap(([stage, n]) => Array.from({ length: n }, () => ({ stage }))),
  ];

  for (const item of plan) {
    seq++;
    const lead = item.demo ? null : appliedLeads[(seq - 2) % appliedLeads.length];
    const admittedNow = item.stage === "ADMITTED";
    const year = admittedNow ? years.curr : years.next;
    const cls = item.demo
      ? classes.find((c) => c.code === "Y7")!
      : rng.pick(classes.filter((c) => c.order >= 1 && c.order <= 13));
    const boarding =
      cls.order >= 6
        ? rng.pick(["FULL", "FULL", "DAY", "FLEXI"] as const)
        : cls.order >= 4
          ? rng.pick(["DAY", "FLEXI"] as const)
          : "DAY";
    const surname = item.demo ? "Sethi" : (lead?.parentName.split(" ").slice(-1)[0] ?? rng.pick(SURNAMES));
    const parentName = item.demo
      ? "Rohan Sethi"
      : (lead?.parentName ?? `${rng.pick(ADULT_FEMALE)} ${surname}`);
    const email = item.demo
      ? "applicant@aurelia-sample.test"
      : (lead?.email ??
        `${parentName.split(" ")[0]!.toLowerCase()}.${surname.toLowerCase()}.app${seq}@example.com`);
    const phone = lead?.phone ?? `+91 9${String(870000000 + seq * 4441).slice(0, 9)}`;
    const registeredAt = item.demo
      ? utc(2026, 8, 18)
      : new Date(
          Math.max(lead?.createdAt.getTime() ?? utc(2026, 4, 1).getTime(), utc(2026, 3, 15).getTime()) +
            rng.int(5, 25) * day,
        );
    const ref = `AH26-${String(seq).padStart(4, "0")}`;
    const app = await db.application.create({
      data: {
        ref,
        stage: "REGISTERED",
        leadId: lead?.id,
        applicantUserId: item.demo ? users.APPLICANT : undefined,
        childFirstName: item.demo ? "Mehr" : (lead?.childName ?? rng.pick(GIRL_NAMES)),
        childLastName: surname,
        dob: utc(year.startDate.getUTCFullYear() - cls.minAge - 1, rng.int(1, 12), rng.int(1, 28)),
        currentSchool: rng.pick([
          "Sample Public School",
          "Riverside Academy (sample)",
          "Hillview International (sample)",
          "Home-schooled",
        ]),
        classId: cls.id,
        startYearId: year.id,
        boardingType: boarding,
        guardians: [
          {
            relation: "Mother",
            name: item.demo ? "Pooja Sethi" : parentName,
            occupation: "Architect",
            phone,
            email,
            address: "14 Sample Lane, Pune 000000",
          },
          {
            relation: "Father",
            name: item.demo ? "Rohan Sethi" : `${rng.pick(ADULT_MALE)} ${surname}`,
            occupation: "Consultant",
            phone: `+91 9${String(860000000 + seq * 3331).slice(0, 9)}`,
            email: "",
            address: "14 Sample Lane, Pune 000000",
          },
        ],
        contactEmail: email,
        contactPhone: phone,
        registrationPaidAt: registeredAt,
        declarationAt: registeredAt,
        scholarshipInterest: rng.chance(0.25),
        createdAt: new Date(registeredAt.getTime() - day),
      },
    });
    await db.applicationEvent.create({
      data: {
        applicationId: app.id,
        toStage: "DRAFT",
        note: "Registration started online",
        createdAt: new Date(registeredAt.getTime() - day),
      },
    });
    await db.applicationEvent.create({
      data: {
        applicationId: app.id,
        fromStage: "DRAFT",
        toStage: "REGISTERED",
        note: "Registration fee received",
        createdAt: registeredAt,
      },
    });
    if (!item.demo && !(await db.user.findUnique({ where: { email } }))) {
      const u = await db.user.create({ data: { email, name: parentName, role: "APPLICANT" } });
      await db.application.update({ where: { id: app.id }, data: { applicantUserId: u.id } });
    }
    await db.$transaction((tx) =>
      recordPayment(tx, {
        provider: "mock",
        providerPaymentId: `mock_pay_reg_${++paySeq}`,
        method: rng.pick(["UPI", "CARD", "NETBANKING"] as const),
        amountPaise: 1_000_000,
        receivedAt: registeredAt,
        applicationId: app.id,
        allocate: false,
      }),
    );

    // Documents
    for (const kind of ["BIRTH_CERTIFICATE", "REPORT_CARD", "PHOTO", "ID_PROOF"]) {
      const uploaded = item.stage !== "REGISTERED" || rng.chance(0.5);
      const key = uploaded ? `application/${app.id}/${kind.toLowerCase()}-seed.pdf` : null;
      if (key) {
        await storage.put(key, MINI_PDF, "application/pdf");
        await db.upload.create({
          data: {
            key,
            fileName: `${kind.toLowerCase().replace(/_/g, "-")}.pdf`,
            mime: "application/pdf",
            size: MINI_PDF.length,
            ownerType: "application",
            ownerId: `${app.id}:${kind}`,
            status: "STORED",
          },
        });
      }
      const verified = PATH.indexOf(item.stage) >= 1 || ["WAITLISTED", "REJECTED"].includes(item.stage);
      await db.applicationDocument.create({
        data: {
          applicationId: app.id,
          kind,
          fileKey: key,
          fileName: key ? `${kind.toLowerCase().replace(/_/g, "-")}.pdf` : null,
          mime: key ? "application/pdf" : null,
          size: key ? MINI_PDF.length : null,
          status: key && verified ? "VERIFIED" : "PENDING",
          verifiedById: verified ? actor.id : null,
          verifiedAt: verified ? new Date(registeredAt.getTime() + 4 * day) : null,
        },
      });
    }

    // Walk the state machine to the target stage
    const target = item.stage;
    const route: ApplicationStage[] =
      target === "WAITLISTED"
        ? ["DOCUMENTS", "ASSESSMENT", "REVIEW", "WAITLISTED"]
        : target === "REJECTED"
          ? ["DOCUMENTS", "ASSESSMENT", "REVIEW", "REJECTED"]
          : PATH.slice(0, PATH.indexOf(target) + 1);
    let at = registeredAt.getTime();
    for (const stage of route) {
      if (stage === "ASSESSMENT") {
        const assessAt = new Date(at + rng.int(5, 12) * day + 10 * 3600_000);
        await db.application.update({ where: { id: app.id }, data: { assessmentAt: assessAt } });
      }
      if (stage === "REVIEW") {
        await db.application.update({
          where: { id: app.id },
          data: {
            assessmentScores: {
              english: rng.int(55, 95),
              maths: rng.int(50, 96),
              reasoning: rng.int(55, 98),
              interview: rng.int(6, 10),
              comments: rng.pick([
                "Articulate and curious.",
                "Strong reasoning; reading below age — support plan suggested.",
                "Confident in the interview, enjoyed the science task.",
              ]),
            },
            reviewNotes: "Panel review complete (sample).",
          },
        });
      }
      if (stage === "FEE_PAID") {
        // pay the first instalment of the offer invoice exactly as the gateway would
        const student = await db.student.findUniqueOrThrow({
          where: { applicationId: app.id },
          include: { invoices: { include: { instalments: { orderBy: { seq: "asc" } } } } },
        });
        const first = student.invoices[0]!.instalments[0]!;
        await db.$transaction((tx) =>
          recordPayment(tx, {
            provider: "mock",
            providerPaymentId: `mock_pay_offer_${++paySeq}`,
            method: "NETBANKING",
            amountPaise: first.amountPaise,
            receivedAt: new Date(at + 3 * day),
            studentId: student.id,
            allocate: { instalmentId: first.id },
          }),
        );
      }
      const by = ["OFFER", "WAITLISTED", "REJECTED", "ADMITTED"].includes(stage) ? principal : actor;
      await db.$transaction(
        (tx) =>
          moveStageInTx(
            tx,
            app.id,
            stage,
            stage === "FEE_PAID" ? null : by,
            stage === "REJECTED" ? "Panel decision" : undefined,
            { planCode: rng.pick(["THREE", "TWO", "ONE"]) },
          ),
        { timeout: 30_000 },
      );
      at += rng.int(4, 12) * day;
      const latest = await db.applicationEvent.findFirstOrThrow({
        where: { applicationId: app.id },
        orderBy: { createdAt: "desc" },
      });
      await db.applicationEvent.update({
        where: { id: latest.id },
        data: { createdAt: new Date(Math.min(at, SEED_TODAY.getTime() - day)) },
      });
    }
    if (target === "OFFER")
      await db.application.update({
        where: { id: app.id },
        data: {
          offerIssuedAt: new Date(Math.min(at, SEED_TODAY.getTime() - 2 * day)),
          offerExpiresAt: new Date(SEED_TODAY.getTime() + 12 * day),
        },
      });
    await db.application.update({
      where: { id: app.id },
      data: { updatedAt: new Date(Math.min(at, SEED_TODAY.getTime())) },
    });
  }
  await db.receiptSequence.upsert({
    where: { financialYear: "APP:26" },
    create: { financialYear: "APP:26", lastSeq: seq },
    update: { lastSeq: seq },
  });
  return seq;
}
