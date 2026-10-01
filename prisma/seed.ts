import { PrismaClient } from "@prisma/client";
import { seedAcademics, seedUsers } from "./seed/core";
import { seedFees } from "./seed/fees";
import { seedVacancies } from "./seed/careers";

const db = new PrismaClient();

/** Wipes every table (demo data only) then rebuilds the sample school. */
export async function resetDatabase(client: PrismaClient = db) {
  const tables = await client.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length)
    await client.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
}

export async function seed(client: PrismaClient = db) {
  const started = Date.now();
  await resetDatabase(client);
  const users = await seedUsers(client);
  const academics = await seedAcademics(client);
  await seedFees(client, academics, users.ACCOUNTS);
  await seedVacancies(client);
  console.log(
    `Seeded ${Object.keys(users).length} demo users, ${academics.classes.length} classes in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

if (require.main === module || process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
