import type { ClassBand, PrismaClient, Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { DEMO_PASSWORD, DEMO_USERS } from "../../src/lib/auth/demo-users";

export const CLASSES: { code: string; name: string; band: ClassBand; minAge: number }[] = [
  { code: "NUR", name: "Nursery", band: "PRE_PREP", minAge: 3 },
  { code: "REC", name: "Reception", band: "PRE_PREP", minAge: 4 },
  { code: "Y1", name: "Year 1", band: "PRE_PREP", minAge: 5 },
  { code: "Y2", name: "Year 2", band: "PRE_PREP", minAge: 6 },
  { code: "Y3", name: "Year 3", band: "PREP", minAge: 7 },
  { code: "Y4", name: "Year 4", band: "PREP", minAge: 8 },
  { code: "Y5", name: "Year 5", band: "PREP", minAge: 9 },
  { code: "Y6", name: "Year 6", band: "PREP", minAge: 10 },
  { code: "Y7", name: "Year 7", band: "UPPER", minAge: 11 },
  { code: "Y8", name: "Year 8", band: "UPPER", minAge: 12 },
  { code: "Y9", name: "Year 9", band: "UPPER", minAge: 13 },
  { code: "Y10", name: "Year 10", band: "UPPER", minAge: 14 },
  { code: "Y11", name: "Year 11", band: "UPPER", minAge: 15 },
  { code: "Y12", name: "Year 12", band: "SIXTH_FORM", minAge: 16 },
  { code: "Y13", name: "Year 13", band: "SIXTH_FORM", minAge: 17 },
];

export const HOUSES = [
  { name: "Banyan", colour: "#2f6b47" },
  { name: "Kingfisher", colour: "#2d5a86" },
  { name: "Saffron", colour: "#c88a17" },
  { name: "Tamarind", colour: "#8f3f26" },
];

export const SUBJECTS = [
  ["ENG", "English"],
  ["MAT", "Mathematics"],
  ["SCI", "Science"],
  ["BIO", "Biology"],
  ["CHE", "Chemistry"],
  ["PHY", "Physics"],
  ["HIS", "History"],
  ["GEO", "Geography"],
  ["FRE", "French"],
  ["HIN", "Hindi"],
  ["ART", "Art & Design"],
  ["MUS", "Music"],
  ["DRA", "Drama"],
  ["CSC", "Computer Science"],
  ["ECO", "Economics"],
  ["PE", "Physical Education"],
  ["PSY", "Psychology"],
  ["WEL", "Wellbeing"],
] as const;

export async function seedUsers(db: PrismaClient) {
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const names: Partial<Record<Role, string>> = {
    SUPER_ADMIN: "Sana Mirza (sample)",
    PRINCIPAL: "Dr. Helena Varghese (sample)",
    ADMISSIONS: "Rhea D'Souza (sample)",
    ACCOUNTS: "Farhan Qureshi (sample)",
    REGISTRAR: "Lakshmi Iyer (sample)",
    TEACHER: "Tara Bhatt (sample)",
    HOUSEPARENT: "Mrs. Joan Pinto (sample)",
    HR: "Ishaan Mehra (sample)",
    PARENT: "Kavita Menon (sample)",
    APPLICANT: "Rohan Sethi (sample)",
  };
  const users: Record<string, string> = {};
  for (const d of DEMO_USERS) {
    const u = await db.user.create({
      data: { email: d.email, name: names[d.role], role: d.role, passwordHash, emailVerified: new Date() },
    });
    users[d.role] = u.id;
  }
  return users;
}

export function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

export async function seedAcademics(db: PrismaClient) {
  const prev = await db.academicYear.create({
    data: { name: "2025-26", startDate: utc(2025, 4, 1), endDate: utc(2026, 3, 31), isCurrent: false },
  });
  const curr = await db.academicYear.create({
    data: { name: "2026-27", startDate: utc(2026, 4, 1), endDate: utc(2027, 3, 31), isCurrent: true },
  });
  const next = await db.academicYear.create({
    data: { name: "2027-28", startDate: utc(2027, 4, 1), endDate: utc(2028, 3, 31), isCurrent: false },
  });
  for (const [y, year] of [
    [2025, prev],
    [2026, curr],
    [2027, next],
  ] as const) {
    await db.term.createMany({
      data: [
        { yearId: year.id, name: "Monsoon term", startDate: utc(y, 4, 1), endDate: utc(y, 8, 31) },
        { yearId: year.id, name: "Autumn term", startDate: utc(y, 9, 1), endDate: utc(y, 12, 20) },
        { yearId: year.id, name: "Spring term", startDate: utc(y + 1, 1, 5), endDate: utc(y + 1, 3, 31) },
      ],
    });
  }
  const classes = [];
  for (const [i, c] of CLASSES.entries())
    classes.push(await db.classLevel.create({ data: { ...c, order: i } }));
  const houses = [];
  for (const h of HOUSES) houses.push(await db.house.create({ data: h }));
  const subjects = [];
  for (const [code, name] of SUBJECTS) subjects.push(await db.subject.create({ data: { code, name } }));
  return { prev, curr, next, classes, houses, subjects };
}
