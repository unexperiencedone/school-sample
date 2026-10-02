import { Prisma, type PrismaClient, type StaffAppStatus, type Vacancy } from "@prisma/client";
import vacancies from "../../content/vacancies.json";
import {
  PHASES,
  STEPS,
  type StaffApplicationData,
  type SUBJECTS,
} from "../../src/lib/schemas/staff-application";
import {
  scorecardTotal,
  stageNoteBody,
  type ScorecardInput,
} from "../../src/lib/services/careers-admin-rules";
import { utc } from "./core";
import { SEED_TODAY } from "./finance";
import { ADULT_FEMALE, ADULT_MALE, GIRL_NAMES, SURNAMES } from "./names";
import type { Rng } from "./rng";

const LOCATION = "Kesarbagh campus (sample)";

/** Seeds the 12 sample vacancies from content/vacancies.json (the CRM owns them afterwards). */
export async function seedVacancies(db: PrismaClient) {
  const rows = [];
  for (const [i, v] of vacancies.entries()) {
    rows.push(
      await db.vacancy.create({
        data: {
          slug: v.slug,
          title: v.title,
          department: v.department,
          employment: v.employment,
          location: LOCATION,
          summary: v.summary,
          description: `${v.summary}\n\nAurelia Hall is a fictional all-girls British-curriculum day and boarding school. This sample vacancy illustrates how roles are advertised and how applications flow into the CRM.\n\nYou will join a warm, ambitious team that takes professional learning seriously, with two hours of protected development time each week and a mentor in your first year.\n\nAll appointments are subject to safer-recruitment checks, including references, identity and qualification checks and police verification.`,
          requirements: v.requirements,
          closesAt: utc(2026, 11 + (i % 3), 15 + (i % 10)),
          status: i === 11 ? "CLOSED" : "OPEN",
        },
      }),
    );
  }
  return rows;
}

// ─── Staff applications ──────────────────────────────────────────────────────────────────────

const day = 86400_000;
const hour = 3600_000;
const IST = 5.5 * hour;
/** Clamp a timestamp so nothing in the demo history lies in the future. */
const past = (t: number) => new Date(Math.min(t, SEED_TODAY.getTime() - 2 * hour));
/** The IST calendar day of `t`, at hh:mm IST. */
const istAt = (t: number, h: number, m = 0) => {
  const d = new Date(t + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - IST;
};

const NOW_MONTH = `${SEED_TODAY.getUTCFullYear()}-${String(SEED_TODAY.getUTCMonth() + 1).padStart(2, "0")}`;
const toIdx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fromIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

type Kind = "teaching" | "boarding" | "nursing" | "office";
type Subject = (typeof SUBJECTS)[number];
type Phase = (typeof PHASES)[number];

type Profile = {
  kind: Kind;
  subjects: Subject[];
  phases: Phase[];
  roles: string[];
  employers: string[];
  /** Qualification names: first degree, optional second degree, professional award. */
  quals: [string, string | null, string];
};

const ALL_PHASES: Phase[] = [...PHASES];
const SCHOOLS = [
  "a girls' day school in Pune",
  "a co-educational day school in Nashik",
  "a boarding school in the Western Ghats",
  "an international school in Bengaluru",
  "a CBSE school in Nagpur",
  "a girls' school in Kolhapur",
  "a day school in Hyderabad",
];

const PROFILES: Record<string, Profile> = {
  "teacher-of-mathematics": {
    kind: "teaching",
    subjects: ["Mathematics"],
    phases: ["Middle School (Years 7–9)", "Upper School (Years 10–13)"],
    roles: ["Teacher of Mathematics", "Mathematics Teacher", "Mathematics Teacher and Year 8 tutor"],
    employers: SCHOOLS,
    quals: ["B.Sc. Mathematics", "M.Sc. Mathematics", "B.Ed."],
  },
  "teacher-of-english": {
    kind: "teaching",
    subjects: ["English", "Drama"],
    phases: ["Middle School (Years 7–9)", "Upper School (Years 10–13)"],
    roles: ["Teacher of English", "English Teacher", "English Teacher and debating coach"],
    employers: SCHOOLS,
    quals: ["B.A. English Literature", "M.A. English", "Postgraduate Certificate in Education"],
  },
  "head-of-chemistry": {
    kind: "teaching",
    subjects: ["Chemistry", "Physics"],
    phases: ["Middle School (Years 7–9)", "Upper School (Years 10–13)"],
    roles: [
      "Senior Chemistry Teacher",
      "Second in Science Department",
      "Chemistry Teacher and Olympiad coach",
    ],
    employers: SCHOOLS,
    quals: ["B.Sc. Chemistry", "M.Sc. Chemistry", "B.Ed. (Science)"],
  },
  "pre-prep-class-teacher": {
    kind: "teaching",
    subjects: ["Early Years"],
    phases: ["Early Years", "Prep (Years 1–6)"],
    roles: ["Class Teacher, Year 1", "Early Years Teacher", "Pre-Primary Class Teacher"],
    employers: SCHOOLS,
    quals: ["B.A. Child Development", null, "Diploma in Early Childhood Education"],
  },
  "houseparent-banyan": {
    kind: "boarding",
    subjects: ["Boarding care"],
    phases: ["Prep (Years 1–6)", "Middle School (Years 7–9)"],
    roles: ["Assistant Houseparent", "Residential Tutor", "Boarding Welfare Officer"],
    employers: [
      "a boarding school in the Western Ghats",
      "a girls' hostel run by a charitable trust in Pune",
      "a residential school in Dehradun",
    ],
    quals: ["B.A. Psychology", null, "Certificate in Child Safeguarding"],
  },
  "school-nurse": {
    kind: "nursing",
    subjects: ["Nursing & wellbeing"],
    phases: ALL_PHASES,
    roles: ["Staff Nurse", "School Nurse", "Paediatric Nurse"],
    employers: [
      "a children's hospital in Pune",
      "a private clinic in Nashik",
      "an international school in Mumbai",
    ],
    quals: ["B.Sc. Nursing", null, "Diploma in Paediatric Nursing"],
  },
  "teacher-of-french": {
    kind: "teaching",
    subjects: ["French", "Spanish"],
    phases: ["Prep (Years 1–6)", "Middle School (Years 7–9)", "Upper School (Years 10–13)"],
    roles: ["French Teacher", "Teacher of French and Spanish", "Languages Teacher"],
    employers: SCHOOLS,
    quals: ["B.A. French", "M.A. French", "B.Ed."],
  },
  "admissions-officer": {
    kind: "office",
    subjects: ["Learning Support"],
    phases: ALL_PHASES,
    roles: ["Admissions Coordinator", "Registrar's Assistant", "Front Office Manager"],
    employers: [
      "a CBSE school in Nagpur",
      "an international school in Bengaluru",
      "a university admissions office",
    ],
    quals: [
      "B.A. Communication",
      "Master of Business Administration",
      "Certificate in Customer Relationship Management",
    ],
  },
  "accounts-assistant": {
    kind: "office",
    subjects: ["Business Studies", "Economics"],
    phases: ALL_PHASES,
    roles: ["Accounts Executive", "Junior Accountant", "Fees and Accounts Assistant"],
    employers: [
      "a chartered accountancy firm in Pune",
      "a co-educational day school in Nashik",
      "a manufacturing company in Pune",
    ],
    quals: ["B.Com.", "M.Com.", "Certificate in Tally and GST"],
  },
};

const UNIVERSITIES = [
  "Deccan Plateau University",
  "Western Ghats University",
  "Coromandel University",
  "Malabar University",
  "Himalayan Foothills University",
  "Narmada Valley University",
];
const COLLEGES_OF_EDUCATION = [
  "Western Ghats College of Education",
  "Malabar Institute of Education",
  "Coromandel Teacher Training Institute",
];
const GRADES = ["First class", "Distinction", "Second class (upper)", "First class with distinction", ""];
const STREETS = [
  "Lotus Residency",
  "Mango Grove Apartments",
  "Jasmine Court",
  "Neem Tree Lane",
  "Sunrise Heights",
  "Orchard Row",
];
const AREAS = [
  "Garden Road",
  "Station Road",
  "Hill View Colony",
  "Lakeside Layout",
  "Temple Street",
  "Market Cross",
];
const CITIES_PIN: [string, string][] = [
  ["Pune", "4110"],
  ["Pune", "4110"],
  ["Mumbai", "4000"],
  ["Nagpur", "4400"],
  ["Nashik", "4220"],
  ["Bengaluru", "5600"],
  ["Hyderabad", "5000"],
  ["Kolhapur", "4160"],
];
const MARITAL = ["Married", "Married", "Single", "Married", "Single"];
const NOTICE = [
  "One month's notice",
  "Two months' notice",
  "Three months' notice",
  "Available from January",
  "Available immediately",
];
const LEAVING = [
  "Seeking more responsibility",
  "Moved city with family",
  "Contract ended",
  "Wanted a larger department",
  "Career progression",
];
const INTERESTS = [
  "Hill walking, classical dance and volunteering with a reading charity.",
  "Cricket coaching for children, cooking and amateur astronomy.",
  "Choir singing, sketching and organising book swaps.",
  "Badminton, gardening and learning a new language each year.",
  "Photography, community theatre and weekend cycling.",
];
const COMMENTS = [
  "Clear, warm and well prepared. References are positive.",
  "Strong subject knowledge; needs more experience of older year groups.",
  "Excellent safeguarding answers. Would fit our values well.",
  "Thoughtful candidate with a good record of leading clubs.",
  "Solid all round. Panel to probe assessment practice.",
];
const REFEREE_ROLES: Record<Kind, string[]> = {
  teaching: ["Head of Department", "Vice Principal", "Principal", "Head of Year"],
  boarding: ["Senior Houseparent", "Deputy Head (Pastoral)", "Warden"],
  nursing: ["Chief Medical Officer", "Nursing Superintendent", "Principal"],
  office: ["Office Manager", "Registrar", "Finance Manager", "Principal"],
};

type SpecPlan = { slug: string; status: StaffAppStatus; female: boolean; note?: string };

/** Who applied for what, and how far each application has got. Twenty in all across eight vacancies. */
const PLAN: SpecPlan[] = [
  { slug: "teacher-of-mathematics", status: "RECEIVED", female: true },
  { slug: "teacher-of-mathematics", status: "SHORTLISTED", female: true },
  { slug: "teacher-of-mathematics", status: "INTERVIEW", female: false },
  { slug: "teacher-of-english", status: "RECEIVED", female: true },
  { slug: "teacher-of-english", status: "INTERVIEW", female: true, note: "pending" },
  { slug: "teacher-of-english", status: "REJECTED", female: false },
  { slug: "head-of-chemistry", status: "SHORTLISTED", female: true },
  { slug: "head-of-chemistry", status: "OFFER", female: false },
  { slug: "head-of-chemistry", status: "RECEIVED", female: true },
  { slug: "pre-prep-class-teacher", status: "RECEIVED", female: true },
  { slug: "pre-prep-class-teacher", status: "SHORTLISTED", female: true },
  { slug: "pre-prep-class-teacher", status: "HIRED", female: true },
  { slug: "houseparent-banyan", status: "INTERVIEW", female: true },
  { slug: "houseparent-banyan", status: "OFFER", female: true },
  { slug: "school-nurse", status: "HIRED", female: true },
  { slug: "school-nurse", status: "REJECTED", female: true },
  { slug: "teacher-of-french", status: "RECEIVED", female: true },
  { slug: "teacher-of-french", status: "INTERVIEW", female: true, note: "break" },
  { slug: "admissions-officer", status: "SHORTLISTED", female: true, note: "unemployed" },
  { slug: "accounts-assistant", status: "REJECTED", female: false },
];

/** How many days before "today" an application in each stage was submitted (older the further it has progressed). */
const SUBMITTED_DAYS_AGO: Record<StaffAppStatus, [number, number]> = {
  DRAFT: [1, 5],
  RECEIVED: [1, 13],
  SHORTLISTED: [14, 32],
  INTERVIEW: [24, 38],
  OFFER: [34, 46],
  HIRED: [44, 55],
  REJECTED: [18, 52],
};
/** Rating ranges (low, high) by stage for the seeded scorecards. */
const SCORE_RANGE: Partial<Record<StaffAppStatus, [number, number]>> = {
  SHORTLISTED: [3, 4],
  INTERVIEW: [3, 5],
  OFFER: [4, 5],
  HIRED: [4, 5],
  REJECTED: [2, 3],
};

export type StaffApplicationSpec = {
  ref: string;
  vacancySlug: string;
  status: StaffAppStatus;
  email: string;
  fullName: string;
  data: StaffApplicationData;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  score: number | null;
  scorecard: (ScorecardInput & { scoredAt: string }) | null;
  notes: { body: string; createdAt: Date }[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const phoneNo = (rng: Rng) => `+91 90000 ${String(rng.int(0, 99999)).padStart(5, "0")}`;

function statement(
  rng: Rng,
  kind: Kind,
  p: { role: string; current: boolean; subject: string; years: number; setting: string },
): string {
  const { role, years, setting } = p;
  const subject = ["English", "French", "Spanish", "Hindi"].includes(p.subject)
    ? p.subject
    : p.subject.toLowerCase();
  const inRole = `In my ${p.current ? "current" : "most recent"} role as ${role}`;
  const opening: Record<Kind, string> = {
    teaching: `I am applying to Aurelia Hall because I want to teach in a school that treats ${subject} as something girls can be ambitious about. Over the last ${years} years I have worked in ${setting}, where I have planned lessons that begin with a real question, and I have learned how much confidence grows when students are trusted to explain their thinking aloud.`,
    boarding: `I am applying to Aurelia Hall because I believe a boarding house should feel like a second home that also expects the best of its girls. Over the last ${years} years I have worked in ${setting}, caring for children away from their families, and I have learned that routine, patience and a sense of humour matter more than any rule on the wall.`,
    nursing: `I am applying to Aurelia Hall because school nursing lets me look after children's health in a setting where small kindnesses make a big difference. Over the last ${years} years I have worked in ${setting}, treating everything from a scraped knee to a long-term condition, and I have learned that a calm voice is often the first medicine a child needs.`,
    office: `I am applying to Aurelia Hall because I enjoy being the first friendly face a family meets and the person who makes complicated processes feel simple. Over the last ${years} years I have worked in ${setting}, where accuracy, courtesy and keeping my promises have been the foundation of my role.`,
  };
  const practice: Record<Kind, string> = {
    teaching: `${inRole} I use short low-stakes quizzes to find gaps early, set clear success criteria, and give feedback that tells a student what to do next rather than only what went wrong. I have mentored a trainee colleague, run an after-school club and contributed to department schemes of work, so I know how much good teaching depends on a team that shares its best ideas.`,
    boarding: `${inRole} I run evening routines, keep careful records, liaise with parents and work closely with the school nurse and tutors. I have helped girls through homesickness, friendship difficulties and exam stress, and I have organised weekend activities that gave everyone something to look forward to.`,
    nursing: `${inRole} I keep accurate records, give medication safely, work with parents and teachers on care plans and teach first aid to staff and older pupils. I am comfortable making a quick, sensible decision about when a child can stay in school and when a family needs a call.`,
    office: `${inRole} I manage records, deadlines and a steady stream of questions from parents, colleagues and visitors. I have introduced simple checklists that cut errors, trained new colleagues and handled sensitive information with discretion.`,
  };
  const safeguarding =
    "Safeguarding is part of everyday practice for me. I complete child protection training every year, I know when and how to record a concern, and I understand that noticing a small change in a child's behaviour is as important as following a procedure. I would value a school where care and challenge are taken equally seriously.";
  const closing = `Outside work I enjoy ${rng.pick(INTERESTS).toLowerCase()} I would welcome the chance to visit Aurelia Hall, meet the team and talk about how I could contribute. Thank you for considering my application.`;
  return [opening[kind], practice[kind], safeguarding, closing].join("\n\n");
}

/**
 * Builds the 20 sample applications as plain data (no database), so the shape can be unit tested against the real
 * step schemas. All people, schools and institutions are fictional or generic.
 */
export function buildStaffApplications(
  rng: Rng,
  avoidNames: ReadonlySet<string> = new Set(),
): StaffApplicationSpec[] {
  // "Pooja Hegde" is a real person's name that the pools can combine into; keep it out of the demo.
  const used = new Set([...avoidNames, "Pooja Hegde"]);
  const nowIdx = toIdx(NOW_MONTH);
  const specs = PLAN.map((plan, n): StaffApplicationSpec => {
    const profile = PROFILES[plan.slug]!;
    // A name that nobody in the seed already has
    let first: string, last: string;
    do {
      first = rng.pick(plan.female ? ADULT_FEMALE : ADULT_MALE);
      last = rng.pick(SURNAMES);
    } while (used.has(`${first} ${last}`));
    used.add(`${first} ${last}`);
    const fullName = `${first} ${last}`;
    const email = `${first}.${last}@applicant-sample.test`.toLowerCase();
    // The two applications with a gap need enough working years to fit an earlier job before it
    const age = plan.note === "break" || plan.note === "unemployed" ? rng.int(36, 48) : rng.int(27, 52);
    const birthYear = SEED_TODAY.getUTCFullYear() - age;
    const dob = `${birthYear}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
    const [city, pin] = rng.pick(CITIES_PIN);
    const phone = phoneNo(rng);
    const married = rng.pick(MARITAL) === "Married";
    const children =
      married && rng.chance(0.6)
        ? Array.from({ length: rng.int(1, 2) }, () => ({
            name: `${rng.pick(GIRL_NAMES)} ${last}`,
            dob: `${rng.int(2013, 2022)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
          }))
        : [];
    const relative = married
      ? { name: `${rng.pick(plan.female ? ADULT_MALE : ADULT_FEMALE)} ${last}`, relation: "Spouse" }
      : { name: `${rng.pick(ADULT_FEMALE)} ${last}`, relation: "Parent" };

    // Education: first degree at about 21, an optional second degree, then the professional award
    const gradYear = birthYear + 21 + rng.int(0, 1);
    const education = [
      {
        qualification: profile.quals[0],
        institution: rng.pick(UNIVERSITIES),
        year: gradYear,
        grade: rng.pick(GRADES),
      },
      ...(profile.quals[1] && rng.chance(0.7)
        ? [
            {
              qualification: profile.quals[1],
              institution: rng.pick(UNIVERSITIES),
              year: gradYear + 2,
              grade: rng.pick(GRADES),
            },
          ]
        : []),
      {
        qualification: profile.quals[2],
        institution: rng.pick(COLLEGES_OF_EDUCATION),
        year: gradYear + 2 + rng.int(0, 1),
        grade: "",
      },
    ];

    // Employment: the current post (or a career break), then earlier jobs running back without gaps
    // unless this application is one of the two that show a gap.
    const unemployed = plan.note === "unemployed";
    const employer = rng.pick(profile.employers);
    const role = rng.pick(profile.roles);
    const sinceIdx = nowIdx - rng.int(14, 60);
    const gap = plan.note === "break" ? 7 : 0;
    let end = unemployed ? nowIdx - 8 : sinceIdx - 1 - gap;
    const earlier: { employer: string; role: string; from: string; to: string; reasonForLeaving: string }[] =
      [];
    const gradIdx = (gradYear + 1) * 12 + 5;
    const jobs = rng.int(1, 3);
    for (let k = 0; k < jobs; k++) {
      const start = end - rng.int(18, 40) + 1;
      if (start < gradIdx) break;
      earlier.unshift({
        employer: rng.pick(profile.employers),
        role: rng.pick(profile.roles),
        from: fromIdx(start),
        to: fromIdx(end),
        reasonForLeaving: gap && k === 0 ? "Relocated with family" : rng.pick(LEAVING),
      });
      end = start - 1;
    }
    const lastEmployer = unemployed ? (earlier.at(-1)?.employer ?? employer) : employer;

    const refRole = rng.pick(REFEREE_ROLES[profile.kind]);
    const secondEmployer = earlier.at(-1)?.employer ?? lastEmployer;
    const referee = (isCurrent: boolean, org: string, relationship: string) => {
      const rf = rng.pick(ADULT_FEMALE);
      const rl = rng.pick(SURNAMES);
      return {
        name: `${rf} ${rl}`,
        role: isCurrent ? refRole : rng.pick(REFEREE_ROLES[profile.kind]),
        organisation: cap(org),
        email: `${rf}.${rl}@referee-sample.test`.toLowerCase(),
        phone: phoneNo(rng),
        relationship: relationship,
        isCurrentEmployer: isCurrent,
      };
    };

    const subject = profile.subjects[0]!;
    const data: StaffApplicationData = {
      personal: {
        title: plan.female ? rng.pick(["Ms", "Mrs", "Miss"] as const) : "Mr",
        fullName,
        dob,
        gender: plan.female ? "FEMALE" : "MALE",
        nationality: "Indian",
        email,
        phone,
        address: `${rng.int(2, 98)}, ${rng.pick(STREETS)}, ${rng.pick(AREAS)}, ${city} ${pin}${String(rng.int(10, 99))}`,
        noticeOrAvailability: rng.pick(NOTICE),
      },
      family: {
        maritalStatus: married ? "Married" : "Single",
        children,
        emergencyName: relative.name,
        emergencyRelation: relative.relation,
        emergencyPhone: phoneNo(rng),
      },
      education: { items: education },
      current: unemployed
        ? {
            employed: false,
            employer: "",
            role: "",
            since: "",
            noticePeriod: "",
            reasonForLeaving: "Career break to care for a family member",
          }
        : {
            employed: true,
            employer: cap(employer),
            role,
            since: fromIdx(sinceIdx),
            noticePeriod: rng.pick(NOTICE),
            reasonForLeaving: rng.pick(LEAVING),
          },
      history: { items: earlier.map((j) => ({ ...j, employer: cap(j.employer) })) },
      interests: {
        subjects: [...profile.subjects],
        phases: [...profile.phases],
        interests: rng.pick(INTERESTS),
      },
      statement: {
        text: statement(rng, profile.kind, {
          role: unemployed ? (earlier.at(-1)?.role ?? role) : role,
          current: !unemployed,
          subject,
          years: Math.max(2, Math.round((nowIdx - (earlier[0] ? toIdx(earlier[0].from) : sinceIdx)) / 12)),
          setting: employer,
        }),
      },
      references: {
        items: [
          referee(true, lastEmployer, `Line manager at ${lastEmployer}`),
          referee(false, secondEmployer, `Former colleague at ${secondEmployer}`),
        ],
      },
      declaration: {
        safeguarding: true,
        convictions: "NONE",
        convictionsDetail: "",
        pendingAction: plan.note === "pending" ? "DECLARE" : "NONE",
        pendingActionDetail:
          plan.note === "pending"
            ? "A road-traffic matter: I was given a speeding fixed penalty notice in August and the paperwork is still being processed. It has nothing to do with children or my work (sample, benign)."
            : "",
        consent: true,
        truthful: true,
      },
    };

    // Dates
    const [lo, hi] = SUBMITTED_DAYS_AGO[plan.status];
    const submitted = past(
      istAt(SEED_TODAY.getTime() - rng.int(lo, hi) * day, rng.int(8, 21), rng.int(0, 59)),
    );
    const createdAt = past(submitted.getTime() - rng.int(1, 5) * day);
    const event = (afterDays: number) =>
      past(istAt(submitted.getTime() + afterDays * day, rng.int(9, 17), rng.int(0, 59)));

    let scorecard: StaffApplicationSpec["scorecard"] = null;
    let score: number | null = null;
    const range = SCORE_RANGE[plan.status];
    // Shortlisted and beyond are scored; of the rejections only the one that went to interview was.
    if (range && !(plan.status === "REJECTED" && n !== 5)) {
      const r = () => rng.int(range[0], range[1]);
      const card = {
        subjectKnowledge: r(),
        teachingAndLearning: r(),
        safeguardingAwareness: r(),
        schoolValues: r(),
        references: r(),
        comment: rng.pick(COMMENTS),
        scoredAt: event(rng.int(3, 9)).toISOString(),
      };
      scorecard = card;
      score = scorecardTotal(card);
    }
    const notes: StaffApplicationSpec["notes"] = [];
    const addNote = (body: string, afterDays: number) => notes.push({ body, createdAt: event(afterDays) });
    if (n === 1)
      addNote(
        "Strong application. The referee at the current school phoned back within a day and was very positive on classroom management.",
        4,
      );
    if (n === 2)
      addNote(
        "Demo lesson on fractions went well: asked the class excellent questions. Panel meets on Tuesday.",
        12,
      );
    if (plan.note === "pending")
      addNote(
        "Read the pending-action declaration: a speeding fixed penalty notice, unrelated to children. Discussed with the Principal and no concern; will raise it neutrally at interview.",
        6,
      );
    if (n === 5)
      addNote(
        stageNoteBody(
          "INTERVIEW",
          "REJECTED",
          "Subject knowledge was not yet at the level needed for Year 10 and 11 teaching.",
        ),
        16,
      );
    if (n === 7)
      addNote(
        "Offer letter drafted and the salary scale agreed with the Principal. Waiting for the candidate to accept.",
        20,
      );
    if (n === 11)
      addNote(
        "Accepted the offer and joins in January. Police verification and qualification checks requested.",
        24,
      );
    if (n === 15)
      addNote(
        stageNoteBody(
          "RECEIVED",
          "REJECTED",
          "Registration with the state nursing council could not be confirmed.",
        ),
        3,
      );
    if (plan.note === "break")
      addNote(
        "Talked through the seven-month career break (family relocation) by phone: satisfactory. Will cover it again at interview.",
        8,
      );

    const updatedAt = new Date(
      Math.max(
        submitted.getTime(),
        ...notes.map((x) => x.createdAt.getTime()),
        scorecard ? new Date(scorecard.scoredAt).getTime() : 0,
      ),
    );
    return {
      ref: "",
      vacancySlug: plan.slug,
      status: plan.status,
      email,
      fullName,
      data,
      submittedAt: submitted,
      createdAt,
      updatedAt,
      score,
      scorecard,
      notes: notes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    };
  });
  // References run in the order applications arrived
  specs.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  specs.forEach((s, i) => (s.ref = `SA-${SEED_TODAY.getUTCFullYear()}-${String(i + 1).padStart(5, "0")}`));
  return specs;
}

/**
 * Seeds exactly 20 submitted staff applications (no drafts) across eight of the vacancies, with full valid form data,
 * scorecards for everyone shortlisted or beyond and a handful of notes by the HR user. Returns how many were created.
 */
export async function seedStaffApplications(
  db: PrismaClient,
  rng: Rng,
  vacancies: Pick<Vacancy, "id" | "slug">[],
): Promise<number> {
  const [hr, staff] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { email: "hr@aurelia-sample.test" },
      select: { id: true, name: true },
    }),
    db.staff.findMany({ select: { firstName: true, lastName: true } }),
  ]);
  const specs = buildStaffApplications(rng, new Set(staff.map((s) => `${s.firstName} ${s.lastName}`)));
  for (const s of specs) {
    const vacancy = vacancies.find((v) => v.slug === s.vacancySlug);
    if (!vacancy) throw new Error(`Vacancy ${s.vacancySlug} was not seeded`);
    await db.staffApplication.create({
      data: {
        ref: s.ref,
        vacancyId: vacancy.id,
        email: s.email,
        fullName: s.fullName,
        status: s.status,
        currentStep: STEPS.length,
        data: s.data as unknown as Prisma.InputJsonObject,
        score: s.score,
        scorecard: s.scorecard
          ? { ...s.scorecard, scoredById: hr.id, scoredByName: hr.name }
          : Prisma.JsonNull,
        submittedAt: s.submittedAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        notes: { create: s.notes.map((n) => ({ ...n, authorId: hr.id })) },
      },
    });
  }
  return specs.length;
}
