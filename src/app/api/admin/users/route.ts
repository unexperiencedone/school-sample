import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { inviteSchema } from "@/lib/services/settings-rules";
import { inviteStaffUser, listStaffUsers } from "@/lib/services/users-admin";

/** GET /api/admin/users — staff accounts (parents and applicants are not listed). */
export const GET = route(async (_req, { user }) => NextResponse.json({ data: await listStaffUsers(user!) }), {
  permission: "users:manage",
});

/** POST /api/admin/users — invites a staff member: creates the account and emails a sign-in link. */
export const POST = route(
  async (req, { user }) => {
    const body = await parseJson(req, inviteSchema);
    const { user: created, emailed } = await inviteStaffUser(user!, body);
    return NextResponse.json({ data: created, emailed }, { status: 201 });
  },
  { permission: "users:manage" },
);
