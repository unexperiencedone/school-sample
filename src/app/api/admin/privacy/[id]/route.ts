import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { resolveDataRequest } from "@/lib/services/privacy";
import { resolveRequestSchema } from "@/lib/services/privacy-rules";

/** PATCH /api/admin/privacy/[id] — `{ status: "DONE" | "REJECTED", notes }` closes an open request. Audit-logged. */
export const PATCH = route<{ id: string }>(
  async (req, { user, params }) => {
    const body = await parseJson(req, resolveRequestSchema);
    return NextResponse.json({ data: await resolveDataRequest(user!, params.id, body) });
  },
  { permission: "privacy:manage" },
);
