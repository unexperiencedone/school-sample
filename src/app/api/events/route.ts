import { NextResponse } from "next/server";
import { getUpcomingEvents } from "@/lib/content";

export const revalidate = 300;

/** GET /api/events — upcoming public events (Open Mornings, talks, concerts). */
export async function GET() {
  return NextResponse.json({ data: await getUpcomingEvents() });
}
