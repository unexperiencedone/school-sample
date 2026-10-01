import { PrismaClient } from "@prisma/client";
import { seedAcademics, seedUsers } from "./seed/core";
import { seedFees } from "./seed/fees";
import { seedVacancies } from "./seed/careers";
import { seedSections, seedStaff, seedStudents, seedTimetable } from "./seed/people";
import { SEED_TODAY, seedFinance, seedRefundsAndImprest } from "./seed/finance";
import { seedApplications, seedLeads } from "./seed/admissions";
import { seedOutbox } from "./seed/outbox";
import { runLateFees } from "../src/lib/services/jobs";
import { seedContent } from "./seed/content";
import { createRng } from "./seed/rng";

const db = new PrismaClient();

/** Wipes every table (demo data only). */
export async function resetDatabase(client: PrismaClient = db) {
  const tables = await client.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length)
    await client.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
}

/**
 * Builds the fictional school end to end. Deterministic (seeded PRNG) and anchored on the 2026-27 academic year.
 * Reuses the real services (invoices, payments, admissions state machine) so seeded data behaves like real data.
 */
export async function seed(client: PrismaClient = db, log: (m: string) => void = console.log) {
  const t0 = Date.now();
  const step = (label: string) => log(`  ${label.padEnd(34)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const rng = createRng(20260401);
  await resetDatabase(client);
  const users = await seedUsers(client);
  const academics = await seedAcademics(client);
  step("users, years, classes, houses");
  await seedFees(client, academics, users.ACCOUNTS);
  step("fee heads, structures, plans");
  const staff = await seedStaff(client, users, academics.subjects);
  const sections = await seedSections(client, academics, academics.classes, staff);
  await seedTimetable(client, rng, academics.curr.id, academics.subjects);
  step("staff, sections, timetable");
  const { students } = await seedStudents(
    client,
    rng,
    academics,
    academics.classes,
    academics.houses,
    sections,
    users,
  );
  // Admission numbers issued by the app must never collide with seeded ones.
  for (const y of [academics.curr, academics.next])
    await client.receiptSequence.upsert({
      where: { financialYear: `ADM:${y.name}` },
      create: { financialYear: `ADM:${y.name}`, lastSeq: 1000 },
      update: { lastSeq: 1000 },
    });
  step(`${students.length} students & guardians`);
  await seedContent(client, users);
  await seedVacancies(client);
  step("events, announcements, vacancies");
  const { payments } = await seedFinance(client, rng, academics, students, users);
  step(`invoices & ${payments} payments`);
  await seedRefundsAndImprest(client, rng, academics, students, users);
  // The real nightly job, as of "today": late fees, cancellation flags and lapsed advance rebates
  const nightly = await runLateFees(SEED_TODAY);
  step(`refunds, imprest, nightly job (${nightly.forfeited} rebates forfeited)`);
  const leads = await seedLeads(client, rng, users, academics.classes);
  step(`${leads.length} leads, tours`);
  const apps = await seedApplications(client, rng, academics, academics.classes, users, leads);
  step(`${apps} applications`);
  const messages = await seedOutbox(client);
  step(`${messages} outbox messages`);
  log(`Seeded the sample school in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
