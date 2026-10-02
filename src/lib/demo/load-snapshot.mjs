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

/** Tables whose dates are never shifted (sessions and rate limits are transient and empty in the snapshot). */
const SHIFT_SKIP_TABLES = new Set([
  "_prisma_migrations",
  "Session",
  "UsedToken",
  "VerificationToken",
  "RateLimitHit",
]);
/** Birth dates are facts, not events: a shift would make pupils younger than their class. */
const SHIFT_SKIP_COLUMN = /dob/i;
const IST_OFFSET_MS = 5.5 * 3600e3;
const DAY_MS = 86400e3;

/**
 * How many days to move the snapshot forward so its "today" becomes the real today (IST). Always a whole number of
 * weeks, so every date keeps its weekday (tour Saturdays stay Saturdays), and never negative. The shifted "today"
 * therefore lands up to six days *before* the real one, so nothing that was in the past ends up in the future.
 */
export function shiftDays(anchorIso, now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const days = Math.floor((today - Date.parse(`${anchorIso}T00:00:00Z`)) / DAY_MS);
  return days > 0 ? days - (days % 7) : 0;
}

/** One UPDATE per table that moves every date and timestamp column forward by `days`. */
export function shiftStatements(columns, days) {
  const byTable = new Map();
  for (const c of columns) {
    if (SHIFT_SKIP_TABLES.has(c.table_name) || SHIFT_SKIP_COLUMN.test(c.column_name)) continue;
    const set =
      c.data_type === "date"
        ? `"${c.column_name}" + ${days}`
        : `"${c.column_name}" + interval '${days} days'`;
    byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), `"${c.column_name}" = ${set}`]);
  }
  return [...byTable].map(([table, sets]) => `update "${table}" set ${sets.join(", ")}`);
}

export const DATE_COLUMNS_SQL = `select table_name, column_name, data_type from information_schema.columns
  where table_schema = 'public' and data_type in ('timestamp without time zone', 'timestamp with time zone', 'date')
  order by table_name, column_name`;

/** Wipes every application table and loads the snapshot, with its dates moved so that "today" is today. */
export async function loadSnapshot(client, { now = new Date() } = {}) {
  const sql = gunzipSync(readFileSync(SNAPSHOT_FILE)).toString("utf8");
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
    );
    await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
    await client.query(sql);
    await client.query(`select pg_catalog.set_config('search_path', '"$user", public', false)`);
    const stored = await client.query(`select value->>'anchor' as anchor from "Setting" where key = $1`, [
      MARKER,
    ]);
    const snapshotAnchor = stored.rows[0]?.anchor;
    const days = snapshotAnchor ? shiftDays(snapshotAnchor, now) : 0;
    if (days > 0) {
      const { rows: columns } = await client.query(DATE_COLUMNS_SQL);
      for (const statement of shiftStatements(columns, days)) await client.query(statement);
    }
    const anchor = snapshotAnchor
      ? new Date(Date.parse(`${snapshotAnchor}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
      : undefined;
    await markLoaded(client, { anchor, shiftedDays: days });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

export async function markLoaded(client, extra = {}) {
  await client.query(
    `insert into "Setting" (key, value, "updatedAt") values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, "updatedAt" = now()`,
    [MARKER, JSON.stringify({ loadedAt: new Date().toISOString(), ...extra })],
  );
}

/** The date the loaded data is "as of", or null when unknown. */
export async function dataAnchor(client) {
  const { rows } = await client.query(`select value->>'anchor' as anchor from "Setting" where key = $1`, [
    MARKER,
  ]);
  return rows[0]?.anchor ?? null;
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
