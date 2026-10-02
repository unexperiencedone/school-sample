// Build entry for Vercel (`vercel-build` in package.json runs instead of `build`).
//
// 1. Applies migrations to the database.
// 2. Only when NEXT_PUBLIC_DEMO_MODE=true: loads the demo school (prisma/snapshot/demo.sql.gz) unless a previous
//    build already did. The load is one transaction, so a failed build never leaves a half-filled database.
//    It refuses to overwrite a database that holds other users. SEED_ON_BUILD=always forces a reload and
//    WIPES the database.
// 3. Runs `next build`.
//
// Migrations and the load use a direct (unpooled) connection when one is available — Neon sets
// DATABASE_URL_UNPOOLED, Supabase sets POSTGRES_URL_NON_POOLING — because poolers don't support migration locks.
// Why a snapshot and not `pnpm db:seed`: the seed issues thousands of small queries, which takes ~35 s next to the
// database but hours across a region boundary (build machine ↔ database). The snapshot is a handful of statements.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";
import {
  SNAPSHOT_FILE,
  isSnapshotLoaded,
  loadSnapshot,
  looksLikeDemoDatabase,
  markLoaded,
  pgConfig,
  userCount,
} from "../src/lib/demo/load-snapshot.mjs";

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
const t0 = Date.now();
const took = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

console.log("▸ Applying database migrations");
run("pnpm exec prisma migrate deploy", { DATABASE_URL: direct });
console.log(`  done (${took()})`);

const client = new pg.Client(pgConfig(direct));
await client.connect();

const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const force = process.env.SEED_ON_BUILD === "always";
const loaded = await isSnapshotLoaded(client);
if (!demoMode) {
  // Demo data (with known demo passwords) is only ever loaded into a deployment that declares itself a demo.
  console.log('▸ NEXT_PUBLIC_DEMO_MODE is not "true": not loading the demo school');
} else if (loaded && !force) {
  console.log("▸ Demo data already loaded; leaving the database as it is");
} else if (!loaded && !force && (await userCount(client)) > 0 && !(await looksLikeDemoDatabase(client))) {
  // Loading wipes every table. Refuse to do that to a database that holds something other than the demo school.
  console.error(
    "\n✖ This database already has users that are not the demo school's, and no demo marker. Refusing to wipe it.\n" +
      "  Use an empty database, or set SEED_ON_BUILD=always to overwrite it deliberately.\n",
  );
  process.exit(1);
} else if (existsSync(SNAPSHOT_FILE)) {
  console.log(loaded ? "▸ SEED_ON_BUILD=always: reloading the demo school" : "▸ Loading the demo school");
  await loadSnapshot(client);
  console.log(`  done (${took()})`);
} else {
  console.log("▸ No snapshot found; running the seed (slow if the database is far away)");
  run("pnpm -s db:seed", { DATABASE_URL: direct });
  await markLoaded(client);
}
await client.end();

if (process.env.SKIP_NEXT_BUILD === "1") process.exit(0); // lets the database steps be tested on their own
console.log("▸ Building the app");
run("pnpm exec next build");
