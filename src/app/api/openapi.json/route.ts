import { NextResponse } from "next/server";
import spec from "@/lib/openapi/openapi.json";

/** GET /api/openapi.json — the OpenAPI 3.1 description of this API (generated from the route handlers). */
export const GET = () =>
  NextResponse.json(spec, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
