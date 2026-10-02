/*
 * Prints how the app is configured and checks the must-haves. Usage: pnpm verify-env
 *
 *  - Loads .env (without overriding variables already set) and shows every integration: MOCK / LIVE / OFF, whether
 *    its variables are set (names only; values are never printed) and whether it is ready.
 *  - Must-haves: DATABASE_URL reachable (SELECT 1), AUTH_SECRET at least 32 characters in production, CRON_SECRET set.
 *  - Exits non-zero only when a must-have fails and NODE_ENV=production. Elsewhere a failure is a warning.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { integrationStatuses } from "../src/integrations/registry";

/** A small .env reader: KEY=VALUE lines, optional quotes, `#` comments. Variables already in the environment win. */
function loadDotEnv(file: string): number {
  if (!existsSync(file)) return 0;
  let loaded = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2]!;
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2]!;
    else value = value.replace(/\s+#.*$/, "");
    if (process.env[m[1]!] === undefined) {
      process.env[m[1]!] = value;
      loaded++;
    }
  }
  return loaded;
}

type Check = { name: string; ok: boolean; detail: string };

async function databaseCheck(): Promise<Check> {
  const name = "DATABASE_URL reachable";
  if (!process.env.DATABASE_URL) return { name, ok: false, detail: "DATABASE_URL is not set" };
  const client = new PrismaClient();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out after 8 s")), 8000);
      }),
    ]);
    return { name, ok: true, detail: "SELECT 1 succeeded" };
  } catch (e) {
    // Prisma errors can echo the connection string, so only the first line is kept and the URL is masked.
    const first =
      (e instanceof Error ? e.message : String(e)).trim().split("\n").pop() ?? "connection failed";
    return {
      name,
      ok: false,
      detail: first
        .replace(/\w+:\/\/\S+/g, "[url hidden]")
        .replace(/`[^`]*`/g, "`[hidden]`")
        .slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
    await client.$disconnect().catch(() => undefined);
  }
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => pad(c, widths[i]!))
      .join("  ")
      .trimEnd();
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

async function main() {
  const envFile = path.resolve(process.cwd(), ".env");
  const loaded = loadDotEnv(envFile);
  const production = process.env.NODE_ENV === "production";
  console.log(
    `Environment: ${production ? "production" : "development"} (${existsSync(envFile) ? `.env read, ${loaded} variable${loaded === 1 ? "" : "s"} added` : "no .env file"})\n`,
  );

  const statuses = integrationStatuses();
  console.log(
    table(
      ["Integration", "Mode", "Ready", "Provider", "Missing variables"],
      statuses.map((s) => [
        s.label,
        s.mode,
        s.ready ? "yes" : "NO",
        s.provider,
        s.env
          .filter((e) => !e.present)
          .map((e) => e.name)
          .join(", ") || "none",
      ]),
    ),
  );
  const notReady = statuses.filter((s) => !s.ready);
  if (notReady.length)
    console.log(
      `\nNot ready: ${notReady
        .map(
          (s) =>
            `${s.label} (${s.env
              .filter((e) => !e.present)
              .map((e) => e.name)
              .join(", ")})`,
        )
        .join("; ")}`,
    );

  const secret = process.env.AUTH_SECRET ?? "";
  const checks: Check[] = [
    await databaseCheck(),
    {
      name: "AUTH_SECRET length >= 32",
      ok: production ? secret.length >= 32 : true,
      detail: !secret
        ? production
          ? "AUTH_SECRET is not set"
          : "not set (a development fallback is used outside production)"
        : secret.length >= 32
          ? `${secret.length} characters`
          : production
            ? `only ${secret.length} characters`
            : `${secret.length} characters (must be 32 or more in production)`,
    },
    {
      name: "CRON_SECRET set",
      ok: !!process.env.CRON_SECRET,
      detail: process.env.CRON_SECRET ? "set" : "not set: the /api/cron/* routes will refuse every call",
    },
  ];

  console.log("\nMust-haves");
  for (const c of checks)
    console.log(`  ${c.ok ? "ok  " : production ? "FAIL" : "warn"}  ${pad(c.name, 28)} ${c.detail}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length && production) {
    console.error(`\n${failed.length} must-have check${failed.length === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
  } else if (failed.length) {
    console.log(
      `\n${failed.length} warning${failed.length === 1 ? "" : "s"}. These would fail with NODE_ENV=production.`,
    );
  } else {
    console.log("\nAll must-haves pass.");
  }
}

main().catch((e) => {
  console.error("verify-env could not run:", e instanceof Error ? e.message.split("\n")[0] : "unknown error");
  process.exitCode = 1;
});
