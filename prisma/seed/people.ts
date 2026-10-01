import type { AcademicYear, BoardingType, ClassLevel, House, PrismaClient, Subject } from "@prisma/client";
import faculty from "../../content/faculty.json";
import { ADULT_FEMALE, ADULT_MALE, CITIES, GIRL_NAMES, OCCUPATIONS, SURNAMES } from "./names";
import type { Rng } from "./rng";
import { utc } from "./core";

type Years = { prev: AcademicYear; curr: AcademicYear; next: AcademicYear };

const EXTRA_STAFF = [
  ["Tara", "Bhatt", "Year 4 Class Teacher", "Prep", ["MAT", "ENG"]],
  ["Joan", "Pinto", "Houseparent, Banyan", "Boarding", ["WEL"]],
  ["Vikram", "Sood", "Teacher of Physics", "Science", ["PHY", "SCI"]],
  ["Asha", "Naidu", "Teacher of Geography", "Humanities", ["GEO", "HIS"]],
  ["Rohan", "Gill", "Teacher of Computer Science", "Design & Technology", ["CSC"]],
  ["Mira", "Lal", "Teacher of Biology", "Science", ["BIO", "SCI"]],
] as const;

const SUBJECTS_FOR: Record<string, string[]> = {
  "helena-varghese": ["ENG"],
  "anika-rao": ["ENG", "MAT"],
  "meera-chandran": ["MAT"],
  "sophia-dsilva": ["HIS"],
  "ritu-nair": ["ECO"],
  "kavya-iyer": ["CHE", "SCI"],
  "farah-sheikh": ["PE"],
  "leela-menon": ["MUS"],
  "nandini-kulkarni": ["WEL"],
  "zara-bose": ["ART"],
  "priya-hegde": ["FRE", "HIN"],
  "isha-kapoor": ["WEL", "PSY"],
};

/** Staff (12 faculty from content + 6 more = 18), linking demo users for Principal, Teacher and Houseparent. */
export async function seedStaff(db: PrismaClient, users: Record<string, string>, subjects: Subject[]) {
  const bySubject = (codes: readonly string[]) =>
    subjects.filter((s) => codes.includes(s.code)).map((s) => ({ id: s.id }));
  const staff = [];
  for (const f of faculty) {
    const [first, ...rest] = f.name.replace(/^Dr\.\s/, "").split(" ");
    staff.push(
      await db.staff.create({
        data: {
          firstName: first!,
          lastName: rest.join(" "),
          email: `${f.slug}@aurelia-sample.test`,
          phone: "+91 00000 0" + String(1000 + staff.length).slice(-4),
          designation: f.role,
          department: f.department,
          joinedOn: utc(f.joined, 4, 1),
          userId: f.slug === "helena-varghese" ? users.PRINCIPAL : undefined,
          subjects: { connect: bySubject(SUBJECTS_FOR[f.slug] ?? []) },
        },
      }),
    );
  }
  for (const [first, last, designation, department, codes] of EXTRA_STAFF) {
    staff.push(
      await db.staff.create({
        data: {
          firstName: first,
          lastName: last,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@aurelia-sample.test`,
          designation,
          department,
          joinedOn: utc(2021, 6, 1),
          userId: first === "Tara" ? users.TEACHER : first === "Joan" ? users.HOUSEPARENT : undefined,
          subjects: { connect: bySubject(codes) },
        },
      }),
    );
  }
  return staff;
}

/** Two sections per class for each year (one for Sixth Form), with class teachers rotating through the staff. */
export async function seedSections(
  db: PrismaClient,
  years: Years,
  classes: ClassLevel[],
  staff: { id: string }[],
) {
  const sections: Record<string, { id: string; classId: string; yearId: string; name: string }[]> = {};
  let t = 0;
  for (const year of [years.prev, years.curr, years.next]) {
    for (const c of classes) {
      const names = c.band === "SIXTH_FORM" ? ["A"] : ["A", "B"];
      for (const name of names) {
        const s = await db.section.create({
          data: {
            classId: c.id,
            yearId: year.id,
            name,
            capacity: c.band === "PRE_PREP" ? 16 : c.band === "SIXTH_FORM" ? 18 : 20,
            classTeacherId: staff[t++ % staff.length]!.id,
            room: `${c.code}-${name}`,
          },
        });
        (sections[`${year.id}:${c.id}`] ??= []).push(s);
      }
    }
  }
  return sections;
}

export type SeededStudent = {
  id: string;
  classOrder: number;
  boardingType: BoardingType;
  familyId: number;
  isNew: boolean;
  admittedOn: Date;
  firstName: string;
  lastName: string;
};

/**
 * ~240 fictional students across Nursery–Year 13 in the current year, grouped into families (siblings share guardians).
 * The demo parent (Kavita Menon) has two daughters, in Year 4 and Year 8.
 */
export async function seedStudents(
  db: PrismaClient,
  rng: Rng,
  years: Years,
  classes: ClassLevel[],
  houses: House[],
  sections: Record<string, { id: string }[]>,
  users: Record<string, string>,
) {
  const perClass = [12, 14, 15, 16, 16, 16, 17, 17, 18, 18, 18, 17, 17, 12, 11];
  const students: SeededStudent[] = [];
  let familyId = 0;
  let admissionSeq = 0;
  const families: {
    id: number;
    surname: string;
    mother: string;
    father: string;
    city: string;
    occupationM: string;
    occupationF: string;
    founding: boolean;
    staff: boolean;
    kids: number;
  }[] = [];

  const newFamily = (surname = rng.pick(SURNAMES)) => {
    const f = {
      id: ++familyId,
      surname,
      mother: rng.pick(ADULT_FEMALE),
      father: rng.pick(ADULT_MALE),
      city: rng.pick(CITIES),
      occupationM: rng.pick(OCCUPATIONS),
      occupationF: rng.pick(OCCUPATIONS),
      founding: rng.chance(0.15),
      staff: rng.chance(0.015),
      kids: 0,
    };
    families.push(f);
    return f;
  };

  const demoFamily = {
    ...newFamily("Menon"),
    mother: "Kavita",
    father: "Arjun",
    founding: true,
    staff: false,
  };
  families[families.length - 1] = demoFamily;

  for (const [ci, cls] of classes.entries()) {
    const n = perClass[ci] ?? 15;
    for (let k = 0; k < n; k++) {
      const isDemoKid = (cls.code === "Y4" && k === 0) || (cls.code === "Y8" && k === 0);
      // ~30% of children join an existing family (siblings), otherwise a new family
      const fam = isDemoKid
        ? demoFamily
        : families.length > 8 && rng.chance(0.3)
          ? rng.pick(families.filter((x) => x.kids < 3 && x.id !== demoFamily.id))
          : newFamily();
      fam.kids++;
      const age = cls.minAge + 1;
      const dob = utc(2026 - age, rng.int(1, 12), rng.int(1, 28));
      const boarding: BoardingType =
        cls.band === "PRE_PREP" || cls.order < 4
          ? "DAY"
          : cls.order < 6
            ? rng.chance(0.2)
              ? "FLEXI"
              : "DAY"
            : rng.pick(["FULL", "FULL", "FLEXI", "DAY", "DAY"] as const);
      const yearsAgo = Math.min(rng.int(0, 6), Math.max(0, cls.order - 0));
      const admittedYear = Math.max(2019, 2026 - yearsAgo);
      const isNew = admittedYear === 2026;
      const secs = sections[`${years.curr.id}:${cls.id}`]!;
      const firstName = isDemoKid ? (cls.code === "Y4" ? "Anvi" : "Ira") : rng.pick(GIRL_NAMES);
      const s = await db.student.create({
        data: {
          admissionNo: `AH${String(admittedYear).slice(2)}${String(++admissionSeq).padStart(4, "0")}`,
          firstName,
          lastName: fam.surname,
          dob,
          classId: cls.id,
          sectionId: secs[k % secs.length]!.id,
          boardingType: isDemoKid ? (cls.code === "Y8" ? "FULL" : "DAY") : boarding,
          houseId: houses[(admissionSeq + fam.id) % houses.length]!.id,
          status: "ACTIVE",
          admittedOn: utc(admittedYear, 4, 1),
          isFoundingFamily: fam.founding && admittedYear <= 2020,
          isStaffWard: fam.staff,
          medical: {
            create: {
              bloodGroup: rng.pick(["A+", "B+", "O+", "AB+", "O-", "A-"]),
              allergies: rng.chance(0.18)
                ? rng.pick(["Peanuts", "Dust mites", "Penicillin", "Shellfish", "Lactose intolerance"])
                : null,
              conditions: rng.chance(0.08) ? rng.pick(["Mild asthma", "Eczema", "Migraine"]) : null,
              medications: null,
              doctorName: `Dr. ${rng.pick(ADULT_MALE)} ${rng.pick(SURNAMES)} (sample)`,
              doctorPhone: "+91 00000 09999",
            },
          },
        },
      });
      students.push({
        id: s.id,
        classOrder: cls.order,
        boardingType: s.boardingType,
        familyId: fam.id,
        isNew,
        admittedOn: s.admittedOn,
        firstName,
        lastName: fam.surname,
      });
      // previous-year history for continuing pupils
      if (!isNew && ci > 0) {
        const prevCls = classes[ci - 1]!;
        const prevSecs = sections[`${years.prev.id}:${prevCls.id}`]!;
        await db.studentClassHistory.create({
          data: {
            studentId: s.id,
            yearId: years.prev.id,
            classId: prevCls.id,
            sectionId: prevSecs[k % prevSecs.length]!.id,
            outcome: "PROMOTED",
          },
        });
      }
      await db.studentClassHistory.create({
        data: {
          studentId: s.id,
          yearId: years.curr.id,
          classId: cls.id,
          sectionId: secs[k % secs.length]!.id,
        },
      });
    }
  }

  // Guardians: mother + father per family, demo parent linked to the PARENT user.
  for (const f of families) {
    const kids = students.filter((s) => s.familyId === f.id);
    if (!kids.length) continue;
    const mother = await db.guardian.create({
      data: {
        name: `${f.mother} ${f.surname}`,
        email:
          f.id === demoFamily.id
            ? "parent@aurelia-sample.test"
            : `${f.mother.toLowerCase()}.${f.surname.toLowerCase()}${f.id}@example.com`,
        phone: `+91 9${String(800000000 + f.id * 7919).slice(0, 9)}`,
        occupation: f.occupationM,
        address: `${10 + (f.id % 80)} Sample Street, ${f.city}`,
        userId: f.id === demoFamily.id ? users.PARENT : undefined,
        whatsappOptIn: rng.chance(0.9),
        smsOptIn: rng.chance(0.6),
      },
    });
    const father = await db.guardian.create({
      data: {
        name: `${f.father} ${f.surname}`,
        email: `${f.father.toLowerCase()}.${f.surname.toLowerCase()}${f.id}@example.com`,
        phone: `+91 9${String(700000000 + f.id * 6007).slice(0, 9)}`,
        occupation: f.occupationF,
        address: `${10 + (f.id % 80)} Sample Street, ${f.city}`,
      },
    });
    for (const kid of kids) {
      await db.studentGuardian.create({
        data: { studentId: kid.id, guardianId: mother.id, relation: "Mother", isPrimary: true },
      });
      await db.studentGuardian.create({
        data: { studentId: kid.id, guardianId: father.id, relation: "Father" },
      });
    }
  }
  return { students, families: families.length };
}

/** A basic weekly timetable (5 days × 6 periods) for every current-year section from Year 3 upwards. */
export async function seedTimetable(
  db: PrismaClient,
  rng: Rng,
  yearId: string,
  subjects: Subject[],
  staff: { id: string }[],
) {
  const sections = await db.section.findMany({
    where: { yearId, class: { order: { gte: 4 } } },
    include: { class: true },
  });
  const core = subjects.filter((s) =>
    ["ENG", "MAT", "SCI", "HIS", "GEO", "FRE", "HIN", "ART", "MUS", "PE", "CSC", "WEL"].includes(s.code),
  );
  const teachers = await db.staff.findMany({ include: { subjects: true } });
  const rows = [];
  for (const sec of sections) {
    for (let day = 1; day <= 5; day++) {
      for (let period = 1; period <= 6; period++) {
        const subject =
          period <= 2 ? core.find((c) => c.code === (day % 2 ? "MAT" : "ENG"))! : rng.pick(core);
        const teacher = teachers.find((t) => t.subjects.some((s) => s.id === subject.id)) ?? rng.pick(staff);
        rows.push({ sectionId: sec.id, day, period, subjectId: subject.id, teacherId: teacher.id });
      }
    }
  }
  await db.timetableSlot.createMany({ data: rows });
  return rows.length;
}
