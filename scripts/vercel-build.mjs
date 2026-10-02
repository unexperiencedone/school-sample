// Build entry for Vercel (`vercel-build` in package.json runs instead of `build`).
//
// 1. Applies migrations to the database.
// 2. Loads the demo school (prisma/snapshot/demo.sql.gz) unless a previous build already did.
//    The load is one transaction, so a failed build never leaves a half-filled database.
//    SEED_ON_BUILD=always forces a reload — this WIPES the database.
// 3. Runs `next build`.
//
// Migrations and the load use a direct (unpooled) connection when one is available — Neon sets
// DATABASE_URL_UNPOOLED, Supabase sets POSTGRES_URL_NON_POOLING — because poolers don't support migration locks.
// Why a snapshot and not `pnpm db:seed`: the seed issues thousands of small queries, which takes ~35 s next to the
// database but hours across a region boundary (build machine ↔ database). The snapshot is a handful of statements.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";

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

// node-postgres doesn't understand Prisma-only (schema, pgbouncer) or channel_binding parameters
const u = new URL(direct);
for (const k of ["schema", "pgbouncer", "connection_limit", "channel_binding"]) u.searchParams.delete(k);
const client = new pg.Client({ connectionString: u.toString() });
await client.connect();

const MARKER = "demo_snapshot";
const loaded = (await client.query(`select 1 from "Setting" where key = $1`, [MARKER])).rowCount > 0;

if (loaded && process.env.SEED_ON_BUILD !== "always") {
  console.log("▸ Demo data already loaded; leaving the database as it is");
} else {
  const file = "prisma/snapshot/demo.sql.gz";
  if (existsSync(file)) {
    console.log(loaded ? "▸ SEED_ON_BUILD=always: reloading the demo school" : "▸ Loading the demo school");
    const sql = gunzipSync(readFileSync(file)).toString("utf8");
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
      );
      await client.query(
        `truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`,
      );
      await client.query(sql);
      await client.query(`select pg_catalog.set_config('search_path', '"$user", public', false)`);
      await client.query(
        `insert into "Setting" (key, value, "updatedAt") values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, "updatedAt" = now()`,
        [MARKER, JSON.stringify({ loadedAt: new Date().toISOString() })],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
    console.log(`  done (${took()})`);
  } else {
    console.log("▸ No snapshot found; running the seed (slow if the database is far away)");
    run("pnpm -s db:seed", { DATABASE_URL: direct });
    await client.query(
      `insert into "Setting" (key, value, "updatedAt") values ($1, '{}', now()) on conflict (key) do nothing`,
      [MARKER],
    );
  }
}
await client.end();

if (process.env.SKIP_NEXT_BUILD === "1") process.exit(0); // lets the database steps be tested on their own
console.log("▸ Building the app");
run("pnpm exec next build");
