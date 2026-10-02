// Build entry for Vercel (`vercel-build` in package.json runs instead of `build`).
//
// 1. Applies migrations to the database.
// 2. Seeds the fictional demo school if the database is empty (or when SEED_ON_BUILD=always — this WIPES it).
// 3. Runs `next build`.
//
// Migrations and the seed use a direct (unpooled) connection when one is available — Neon/Vercel Postgres set
// DATABASE_URL_UNPOOLED, Supabase sets POSTGRES_URL_NON_POOLING — because poolers don't support migration locks.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error(
    "\n✖ DATABASE_URL is not set. Add a Postgres database (e.g. Vercel → Storage → Neon) and redeploy.\n",
  );
  process.exit(1);
}

const direct =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

console.log("▸ Applying database migrations");
run("pnpm exec prisma migrate deploy", { DATABASE_URL: direct });

const db = new PrismaClient({ datasourceUrl: direct });
const users = await db.user.count();
await db.$disconnect();

if (users === 0 || process.env.SEED_ON_BUILD === "always") {
  console.log(users === 0 ? "▸ Empty database: seeding the demo school" : "▸ SEED_ON_BUILD=always: reseeding");
  run("pnpm -s db:seed", { DATABASE_URL: direct });
} else {
  console.log(`▸ Database already has data (${users} users); skipping the seed`);
}

console.log("▸ Building the app");
run("pnpm exec next build");
