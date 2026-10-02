import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { deleteVacancy, getVacancy, updateVacancy } from "@/lib/services/careers-admin";

/** GET /api/admin/vacancies/[id] — one vacancy with its application counts */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const vacancy = await getVacancy(user!, params.id);
    if (!vacancy) throw new ApiError(404, "NOT_FOUND", "Vacancy not found");
    return NextResponse.json({ data: vacancy });
  },
  { permission: "careers:read" },
);

/** PATCH /api/admin/vacancies/[id] — any subset of the vacancy fields, including `status` to close or reopen. */
export const PATCH = route<{ id: string }>(
  async (req, { params, user }) => {
    const body = await parseJson(req, z.unknown());
    const vacancy = await updateVacancy(user!, params.id, body);
    return NextResponse.json({ data: vacancy });
  },
  { permission: "careers:write" },
);

/** DELETE /api/admin/vacancies/[id] — only while the vacancy has no applications. */
export const DELETE = route<{ id: string }>(
  async (_req, { params, user }) => {
    await deleteVacancy(user!, params.id);
    return new NextResponse(null, { status: 204 });
  },
  { permission: "careers:write" },
);
