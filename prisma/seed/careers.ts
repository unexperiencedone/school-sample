import type { PrismaClient } from "@prisma/client";
import vacancies from "../../content/vacancies.json";
import { utc } from "./core";

const LOCATION = "Kesarbagh campus (sample)";

/** Seeds the 12 sample vacancies from content/vacancies.json (the CRM owns them afterwards). */
export async function seedVacancies(db: PrismaClient) {
  const rows = [];
  for (const [i, v] of vacancies.entries()) {
    rows.push(
      await db.vacancy.create({
        data: {
          slug: v.slug,
          title: v.title,
          department: v.department,
          employment: v.employment,
          location: LOCATION,
          summary: v.summary,
          description: `${v.summary}\n\nAurelia Hall is a fictional all-girls British-curriculum day and boarding school. This sample vacancy illustrates how roles are advertised and how applications flow into the CRM.\n\nYou will join a warm, ambitious team that takes professional learning seriously, with two hours of protected development time each week and a mentor in your first year.\n\nAll appointments are subject to safer-recruitment checks, including references, identity and qualification checks and police verification.`,
          requirements: v.requirements,
          closesAt: utc(2026, 11 + (i % 3), 15 + (i % 10)),
          status: i === 11 ? "CLOSED" : "OPEN",
        },
      }),
    );
  }
  return rows;
}
