import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { reasonSchema, staffRoleSchema } from "@/lib/services/settings-rules";
import { changeStaffRole, setStaffActive } from "@/lib/services/users-admin";

const patchSchema = z
  .object({ role: staffRoleSchema.optional(), active: z.boolean().optional(), reason: reasonSchema })
  .refine((b) => (b.role === undefined) !== (b.active === undefined), "Send either a role or an active flag");

/** PATCH /api/admin/users/[id] — `{ role, reason }` changes a staff role; `{ active, reason }` switches access on or off. */
export const PATCH = route<{ id: string }>(
  async (req, { user, params }) => {
    const body = await parseJson(req, patchSchema);
    if (body.role !== undefined)
      return NextResponse.json({ data: await changeStaffRole(user!, params.id, body) });
    if (body.active !== undefined)
      return NextResponse.json({ data: await setStaffActive(user!, params.id, body) });
    throw new ApiError(400, "BAD_REQUEST", "Nothing to change");
  },
  { permission: "users:manage" },
);
