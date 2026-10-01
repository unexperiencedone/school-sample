import { NextResponse } from "next/server";
import { buildSearchIndex } from "@/lib/search-index";

export const revalidate = 600;

/** GET /api/search — the whole public content index (small), searched client-side on /search. */
export async function GET() {
  return NextResponse.json(
    { data: await buildSearchIndex() },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
