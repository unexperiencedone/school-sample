// Loads the demo school into an (already migrated) database from prisma/snapshot/demo.sql.gz.
// Shared by the Vercel build (scripts/vercel-build.mjs) and the in-app "Reset demo" action.
// One transaction: either the whole school is loaded or the database is left exactly as it was.
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import pg from "pg";

export const SNAPSHOT_FILE = path.join(process.cwd(), "prisma", "snapshot", "demo.sql.gz");
export const MARKER = "demo_snapshot";

/** node-postgres doesn't understand Prisma-only (schema, pgbouncer) or channel_binding parameters. */
export function pgConfig(url) {
  const u = new URL(url);
  for (const k of ["schema", "pgbouncer", "connection_limit", "channel_binding"]) u.searchParams.delete(k);
  return { connectionString: u.toString() };
}

/** True when the database holds the demo school's own accounts (so overwriting it loses nothing real). */
export async function looksLikeDemoDatabase(client) {
  return (await client.query(`select 1 from "User" where email = 'admin@aurelia-sample.test'`)).rowCount > 0;
}

export async function userCount(client) {
  return Number((await client.query(`select count(*) as n from "User"`)).rows[0].n);
}

export async function isSnapshotLoaded(client) {
  return (await client.query(`select 1 from "Setting" where key = $1`, [MARKER])).rowCount > 0;
}

/** Wipes every application table and loads the snapshot. */
export async function loadSnapshot(client) {
  const sql = gunzipSync(readFileSync(SNAPSHOT_FILE)).toString("utf8");
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
    );
    await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
    await client.query(sql);
    await client.query(`select pg_catalog.set_config('search_path', '"$user", public', false)`);
    await markLoaded(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

export async function markLoaded(client) {
  await client.query(
    `insert into "Setting" (key, value, "updatedAt") values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, "updatedAt" = now()`,
    [MARKER, JSON.stringify({ loadedAt: new Date().toISOString() })],
  );
}

/** Convenience for callers that don't hold a client: connect, run, always disconnect. */
export async function withClient(url, fn) {
  const client = new pg.Client(pgConfig(url));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
