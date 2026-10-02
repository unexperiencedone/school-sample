import { PrismaClient } from "@prisma/client";

/** Neon/Supabase poolers (PgBouncer) need `pgbouncer=true` so Prisma doesn't use prepared statements. */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !/-pooler\.|pooler\.supabase\.com|:6543/.test(url) || url.includes("pgbouncer="))
    return undefined;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
