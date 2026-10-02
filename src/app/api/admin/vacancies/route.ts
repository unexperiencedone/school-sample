import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { createVacancy, listVacancies } from "@/lib/services/careers-admin";

/** GET /api/admin/vacancies?q=&status=OPEN|DRAFT|CLOSED — every vacancy with its application counts. */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const data = await listVacancies(user!, { q: sp.q, status: sp.status });
    return NextResponse.json({ data });
  },
  { permission: "careers:read" },
);

/**
 * POST /api/admin/vacancies — create a vacancy. `requirements` is an array of strings (or one per line),
 * `closesAt` is a calendar date (yyyy-mm-dd, end of that day in IST). Validated in the service.
 */
export const POST = route(
  async (req, { user }) => {
    const body = await parseJson(req, z.unknown());
    const vacancy = await createVacancy(user!, body);
    return NextResponse.json({ data: vacancy }, { status: 201 });
  },
  { permission: "careers:write" },
);
