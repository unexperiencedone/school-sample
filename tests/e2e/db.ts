import { PrismaClient } from "@prisma/client";

/** Direct DB access for assertions in e2e tests (same database as the app under test). */
export const testDb = new PrismaClient();
