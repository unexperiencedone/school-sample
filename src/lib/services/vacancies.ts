import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function listOpenVacancies(
  filter: { department?: string; employment?: string; q?: string } = {},
) {
  const where: Prisma.VacancyWhereInput = { status: "OPEN", closesAt: { gte: new Date() } };
  if (filter.department) where.department = filter.department;
  if (filter.employment) where.employment = { startsWith: filter.employment };
  if (filter.q)
    where.OR = [
      { title: { contains: filter.q, mode: "insensitive" } },
      { summary: { contains: filter.q, mode: "insensitive" } },
    ];
  return db.vacancy.findMany({ where, orderBy: [{ closesAt: "asc" }, { title: "asc" }] });
}

export async function vacancyFacets() {
  const rows = await db.vacancy.findMany({
    where: { status: "OPEN", closesAt: { gte: new Date() } },
    select: { department: true, employment: true },
  });
  return {
    departments: [...new Set(rows.map((r) => r.department))].sort(),
    employment: [...new Set(rows.map((r) => r.employment.split(",")[0]!.trim()))].sort(),
  };
}

export function getVacancy(slug: string) {
  return db.vacancy.findUnique({ where: { slug } });
}
