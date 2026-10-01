import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { ApiError, parseJson, route } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { updateLead } from "@/lib/services/leads-admin";
import { LEAD_STATUS_FLOW } from "@/lib/services/leads";

/** GET /api/admin/leads/[id] — lead with activities, bookings and reminders. */
export const GET = route<{ id: string }>(
  async (_req, { params }) => {
    const lead = await db.lead.findUnique({
      where: { id: params.id },
      include: {
        activities: { orderBy: { createdAt: "desc" } },
        bookings: { include: { slot: true } },
        reminders: true,
      },
    });
    if (!lead) throw new ApiError(404, "NOT_FOUND", "Lead not found");
    return NextResponse.json({ data: lead });
  },
  { permission: "leads:read" },
);

const patchSchema = z.object({
  status: z.enum(LEAD_STATUS_FLOW as [LeadStatus, ...LeadStatus[]]).optional(),
  assignedToId: z.string().nullable().optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  lostReason: z.string().max(300).nullable().optional(),
});

/** PATCH /api/admin/leads/[id] — status, assignment, follow-up date. Assignment needs leads:assign. */
export const PATCH = route<{ id: string }>(
  async (req, { params, user }) => {
    const body = await parseJson(req, patchSchema);
    if (body.assignedToId !== undefined && !can(user!.role, "leads:assign"))
      throw new ApiError(403, "FORBIDDEN", "Missing permission: leads:assign");
    const lead = await updateLead(user!, params.id, body);
    return NextResponse.json({ data: lead });
  },
  { permission: "leads:write" },
);
