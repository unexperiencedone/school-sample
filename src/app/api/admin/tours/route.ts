import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { createSlots, upcomingSlots } from "@/lib/services/tours";

/** GET /api/admin/tours?days=28 — upcoming slots with bookings. */
export const GET = route(
  async (req) => {
    const days = Math.min(Number(new URL(req.url).searchParams.get("days") ?? 28) || 28, 120);
    return NextResponse.json({ data: await upcomingSlots(days) });
  },
  { permission: "tours:read" },
);

/** POST /api/admin/tours — create slots: { dates: ["2026-10-12"], times: ["09:30"], capacity: 6, label } */
export const POST = route(
  async (req, { user }) => {
    const b = await parseJson(
      req,
      z.object({
        dates: z
          .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
          .min(1)
          .max(62),
        times: z
          .array(z.string().regex(/^\d{2}:\d{2}$/))
          .min(1)
          .max(8),
        capacity: z.number().int().min(1).max(50),
        label: z.string().min(2).max(80),
      }),
    );
    return NextResponse.json({ created: await createSlots(user!, b) }, { status: 201 });
  },
  { permission: "tours:write" },
);
