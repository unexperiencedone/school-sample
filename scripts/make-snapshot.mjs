// Regenerates prisma/snapshot/demo.sql.gz from a freshly seeded LOCAL database.
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aurelia pnpm db:seed
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aurelia pnpm db:snapshot
// The snapshot is what Vercel loads into an empty database (a few bulk statements instead of thousands of
// round trips). Re-run it whenever the seed or the schema changes.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const url = process.env.DATABASE_URL;
if (!url || !/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Set DATABASE_URL to the LOCAL seeded database (refusing to dump a remote one).");
  process.exit(1);
}
const dump = execFileSync(
  "pg_dump",
  [
    url.split("?")[0],
    "--data-only",
    "--no-owner",
    "--no-privileges",
    "--rows-per-insert=200", // a self-referencing table (Lead) is only valid within one statement
    "--exclude-table=_prisma_migrations",
  ],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
);
// psql meta-commands (\restrict) are not SQL
const sql = dump.split("\n").filter((l) => !l.startsWith("\\")).join("\n");
mkdirSync("prisma/snapshot", { recursive: true });
writeFileSync("prisma/snapshot/demo.sql.gz", gzipSync(sql, { level: 9 }));
console.log(`Wrote prisma/snapshot/demo.sql.gz (${(sql.length / 1e6).toFixed(1)} MB of SQL)`);
