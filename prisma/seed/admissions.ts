import type { AcademicYear, ApplicationStage, ClassLevel, LeadStatus, PrismaClient } from "@prisma/client";
import { moveStageInTx } from "../../src/lib/services/admissions";
import { recordPayment } from "../../src/lib/services/ledger";
import { getStorage } from "../../src/integrations/storage";
import { ADULT_FEMALE, ADULT_MALE, GIRL_NAMES, SURNAMES } from "./names";
import type { Rng } from "./rng";
import { utc } from "./core";
import { SEED_TODAY } from "./finance";
import { formatDate } from "../../src/lib/dates";
import { LEAD_STATUS_LABEL, sourceLabel } from "../../src/lib/services/leads";

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
  ["APPLIED", 16],
  ["ADMITTED", 2],
  ["LOST", 6],
];
/**
 * How long ago (in days) a lead in each status was first received. Later-funnel leads are older; the window is
 * skewed towards its recent end so enquiries build up into the autumn admissions season.
 */
const AGE_WINDOW: Record<LeadStatus, [number, number]> = {
  NEW: [1, 9],
  CONTACTED: [5, 45],
  TOUR_BOOKED: [3, 30],
  TOUR_DONE: [14, 80],
  APPLIED: [60, 200],
  ADMITTED: [190, 235],
  LOST: [80, 220],
};
/** Clamp a timestamp so nothing in the demo history lies in the future. */
const past = (t: number) => new Date(Math.min(t, SEED_TODAY.getTime() - 2 * 3600_000));
const hour = 3600_000;
const IST = 5.5 * hour;
/** The IST calendar day of `t`, at hh:mm IST. */
const istAt = (t: number, h: number, m = 0) => {
  const d = new Date(t + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - IST;
};
/**
 * Moves a staff action into office hours (09:00–18:00 IST). Night-time instants are squeezed linearly into
 * 09:00–09:45 the next morning, so the order of events is preserved.
 */
const officeHours = (t: number) => {
  const h = new Date(t + IST).getUTCHours();
  if (h >= 9 && h < 18) return t;
  const nightStart = h >= 18 ? istAt(t, 18) : istAt(t - day, 18);
  return nightStart + 15 * hour + Math.round(((t - nightStart) / (15 * hour)) * 45 * 60_000);
};
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
  const joinable = classes.filter((c) => c.order <= 13);
  const leads: {
    id: string;
    status: LeadStatus;
    email: string;
    phone: string;
    parentName: string;
    childName: string;
    classApplying: string;
    childDob: Date;
    preferredBoarding: string;
    createdAt: Date;
  }[] = [];
  let i = 0;
  for (const [status, count] of STATUS_PLAN) {
    for (let k = 0; k < count; k++) {
      i++;
      const surname = rng.pick(SURNAMES);
      const parent = `${rng.pick([...ADULT_FEMALE, ...ADULT_MALE])} ${surname}`;
      const child = rng.pick(GIRL_NAMES);
      const [lo, hi] = AGE_WINDOW[status];
      const daysAgo = lo + Math.floor((hi - lo) * rng.next() ** 1.6);
      // Families enquire between 7am and 11pm
      const created = past(istAt(SEED_TODAY.getTime() - daysAgo * day, rng.int(7, 22), rng.int(0, 59)));
      const [utmSource, utmMedium, utmCampaign] = rng.pick(UTM);
      const source = rng.pick(SOURCES);
      // A child who fits the class she's applying for (for next September), with a boarding wish the school offers
      const cls = rng.pick(joinable);
      const childDob = new Date(utc(2026 - cls.minAge, 9, 1).getTime() + rng.int(0, 364) * day);
      const boardingChoices =
        cls.order >= 6
          ? ["full", "flexi", "day", "unsure"]
          : cls.order >= 4
            ? ["flexi", "day", "unsure"]
            : ["day", "unsure"];
      const lead = await db.lead.create({
        data: {
          type: source.includes("tour") ? "TOUR" : "ENQUIRY",
          source,
          status,
          parentName: parent,
          phone: `+91 9${String(810000000 + i * 1931).slice(0, 9)}`,
          email: `${parent.split(" ")[0]!.toLowerCase()}.${surname.toLowerCase()}.${i}@example.com`,
          childName: child,
          childDob,
          classApplying: cls.name,
          preferredBoarding: rng.pick(boardingChoices),
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
          updatedAt: past(created.getTime() + rng.int(1, 20) * day),
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
        childDob,
        preferredBoarding: lead.preferredBoarding ?? "unsure",
        createdAt: created,
      });

      // One coherent timeline: enquiry → call → tour booked → tour (checked in) → applied → admitted / lost.
      const t0 = created.getTime();
      const flow: LeadStatus[] = ["CONTACTED", "TOUR_BOOKED", "TOUR_DONE", "APPLIED", "ADMITTED"];
      const reached =
        status === "LOST"
          ? flow.slice(0, rng.int(1, 3))
          : flow.slice(0, Math.max(0, flow.indexOf(status) + 1));
      const toured = reached.includes("TOUR_BOOKED");
      const futureTour = status === "TOUR_BOOKED";
      let tourAt: Date | null = null;
      if (toured) {
        const when = futureTour
          ? new Date(SEED_TODAY.getTime() + rng.int(2, 18) * day)
          : past(t0 + rng.int(4, 12) * day - day);
        const time = rng.pick(["09:30", "11:30", "14:30"]);
        tourAt = new Date(`${when.toISOString().slice(0, 10)}T${time}:00+05:30`);
        // A past tour can't predate the enquiry: fall back to the morning slot the day after
        if (!futureTour && tourAt.getTime() <= t0)
          tourAt = new Date(`${new Date(t0 + day).toISOString().slice(0, 10)}T09:30:00+05:30`);
      }
      const at: Partial<Record<LeadStatus, number>> = {
        CONTACTED: officeHours(t0 + rng.int(3, 30) * hour),
        TOUR_BOOKED: officeHours(t0 + rng.int(31, 48) * hour),
        TOUR_DONE: tourAt ? tourAt.getTime() + 2 * 3600_000 : undefined,
        APPLIED: officeHours((tourAt?.getTime() ?? t0) + rng.int(2, 8) * day),
      };
      at.ADMITTED = officeHours((at.APPLIED ?? t0) + rng.int(30, 60) * day);
      const acts: { kind: string; body: string; at: number; actor?: string }[] = [
        { kind: "CREATED", body: `Enquiry received via ${sourceLabel(source).toLowerCase()}`, at: t0 },
        ...reached.map((s) => ({
          kind: s === "CONTACTED" ? "CALL" : "STATUS",
          body:
            s === "CONTACTED"
              ? "Called parent — answered questions about boarding and fees"
              : s === "TOUR_BOOKED" && tourAt
                ? `Tour booked for ${formatDate(tourAt, "d MMM, h:mm a")}`
                : `Status → ${LEAD_STATUS_LABEL[s].toLowerCase()}`,
          at: at[s]!,
          actor: users.ADMISSIONS,
        })),
      ];
      if (status === "LOST")
        acts.push({
          kind: "STATUS",
          body: `Marked lost: ${lead.lostReason}`,
          at: officeHours(Math.max(...acts.map((a) => a.at)) + rng.int(7, 20) * day),
          actor: users.ADMISSIONS,
        });
      for (const a of acts)
        await db.leadActivity.create({
          data: { leadId: lead.id, kind: a.kind, body: a.body, actorId: a.actor, createdAt: past(a.at) },
        });

      if (tourAt) {
        const startsAt = tourAt;
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
        // Lost leads that booked but never came are no-shows; the rest checked in
        const noShow = status === "LOST" && !reached.includes("TOUR_DONE");
        await db.tourBooking.create({
          data: {
            slotId: slot.id,
            leadId: lead.id,
            visitors: rng.int(1, 4),
            status: futureTour ? "BOOKED" : noShow ? "NO_SHOW" : "CHECKED_IN",
            checkedInAt: futureTour || noShow ? null : startsAt,
            createdAt: past(at.TOUR_BOOKED!),
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
        createdAt: new Date(
          istAt(SEED_TODAY.getTime() - rng.int(1, 4) * day, rng.int(8, 21), rng.int(0, 59)),
        ),
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
    childDob: Date;
    preferredBoarding: string;
    createdAt: Date;
  }[],
) {
  const actor = { id: users.ADMISSIONS!, role: "ADMISSIONS" as const };
  const principal = { id: users.PRINCIPAL!, role: "PRINCIPAL" as const };
  const storage = getStorage();
  let seq = 0;
  let paySeq = 0;
  const plan: { stage: ApplicationStage; demo?: boolean }[] = [
    { stage: "OFFER", demo: true },
    ...STAGE_PLAN.flatMap(([stage, n]) => Array.from({ length: n }, () => ({ stage }))),
  ];
  const routeTo = (target: ApplicationStage): ApplicationStage[] =>
    target === "WAITLISTED"
      ? ["DOCUMENTS", "ASSESSMENT", "REVIEW", "WAITLISTED"]
      : target === "REJECTED"
        ? ["DOCUMENTS", "ASSESSMENT", "REVIEW", "REJECTED"]
        : PATH.slice(0, PATH.indexOf(target) + 1);

  // Pair applications with enquiries so timelines make sense: the furthest-along applications take the oldest
  // enquiries, admitted pupils take the ADMITTED leads, and the rest registered online without enquiring first.
  const byAge = (a: { createdAt: Date }, b: { createdAt: Date }) =>
    a.createdAt.getTime() - b.createdAt.getTime();
  const admittedLeads = leads.filter((l) => l.status === "ADMITTED").sort(byAge);
  const appliedLeads = leads.filter((l) => l.status === "APPLIED").sort(byAge);
  const leadFor = new Map<number, (typeof leads)[number]>();
  plan
    .map((item, idx) => ({ item, idx }))
    .filter((x) => !x.item.demo)
    .sort((a, b) => routeTo(b.item.stage).length - routeTo(a.item.stage).length)
    .forEach(({ item, idx }) => {
      const lead = item.stage === "ADMITTED" ? admittedLeads.shift() : appliedLeads.shift();
      if (lead) leadFor.set(idx, lead);
    });

  for (const [idx, item] of plan.entries()) {
    seq++;
    const lead = leadFor.get(idx) ?? null;
    const route = routeTo(item.stage);
    // Stage gaps (days) and the latest moment registration can have happened for the whole route to be in the past
    const gaps = route.map(() => rng.int(4, 12));
    const span = (gaps.reduce((a, b) => a + b, 0) + (route.includes("FEE_PAID") ? 3 : 0) + 2) * day;
    const admittedNow = item.stage === "ADMITTED";
    const year = admittedNow ? years.curr : years.next;
    // The application follows its enquiry: same child, same class (a year lower when joining this year), and the
    // boarding the family asked about when the school offers it at that age.
    const enquired = lead ? classes.find((c) => c.name === lead.classApplying) : undefined;
    const cls = item.demo
      ? classes.find((c) => c.code === "Y7")!
      : enquired
        ? admittedNow && enquired.order > 0
          ? classes.find((c) => c.order === enquired.order - 1)!
          : enquired
        : rng.pick(classes.filter((c) => c.order >= 1 && c.order <= 13));
    const wish = lead?.preferredBoarding.toUpperCase();
    const boarding =
      wish === "FULL" && cls.order >= 6
        ? "FULL"
        : wish === "FLEXI" && cls.order >= 4
          ? "FLEXI"
          : wish === "DAY"
            ? "DAY"
            : cls.order >= 6
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
    const notBefore = (lead?.createdAt.getTime() ?? utc(2026, 3, 15).getTime()) + 2 * day;
    // Registration is placed so the latest stage move happened in the last few weeks: a live pipeline, not an archive
    const candidate = item.demo
      ? utc(2026, 8, 18).getTime()
      : istAt(SEED_TODAY.getTime() - span - rng.int(1, 25) * day, rng.int(8, 22), rng.int(0, 59));
    const registeredAt = new Date(Math.max(notBefore, Math.min(candidate, SEED_TODAY.getTime() - span)));
    // If the enquiry was too recent for the full route, compress the stage gaps to fit before today
    const room = (SEED_TODAY.getTime() - day - registeredAt.getTime()) / day;
    const need = gaps.reduce((a, b) => a + b, 0) + (route.includes("FEE_PAID") ? 3 : 0);
    if (need > room) gaps.forEach((g, k) => (gaps[k] = Math.max(1, Math.floor((g * room) / need))));
    const ref = `AH26-${String(seq).padStart(4, "0")}`;
    const app = await db.application.create({
      data: {
        ref,
        stage: "REGISTERED",
        leadId: lead?.id,
        applicantUserId: item.demo ? users.APPLICANT : undefined,
        childFirstName: item.demo ? "Mehr" : (lead?.childName ?? rng.pick(GIRL_NAMES)),
        childLastName: surname,
        dob:
          lead?.childDob ??
          utc(year.startDate.getUTCFullYear() - cls.minAge - 1, rng.int(9, 12), rng.int(1, 28)),
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
    let at = registeredAt.getTime();
    for (const [k, stage] of route.entries()) {
      if (stage === "ASSESSMENT") {
        const assessAt = new Date(istAt(at + Math.max(1, gaps[k]! - 1) * day, rng.pick([10, 11, 14]), 30));
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
            receivedAt: new Date(Math.min(at + 3 * day, SEED_TODAY.getTime() - day)),
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
      at += gaps[k]! * day;
      const latest = await db.applicationEvent.findFirstOrThrow({
        where: { applicationId: app.id },
        orderBy: { createdAt: "desc" },
      });
      await db.applicationEvent.update({
        where: { id: latest.id },
        data: { createdAt: new Date(officeHours(Math.min(at, SEED_TODAY.getTime() - day))) },
      });
    }
    if (item.stage === "OFFER")
      await db.application.update({
        where: { id: app.id },
        data: {
          offerIssuedAt: new Date(officeHours(Math.min(at, SEED_TODAY.getTime() - 2 * day))),
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
