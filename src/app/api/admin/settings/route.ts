import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { schoolSettingsView, updateSchoolProfile } from "@/lib/services/settings";
import { schoolProfileSchema } from "@/lib/services/settings-rules";

/** GET /api/admin/settings — the school profile (saved settings over the static defaults). */
export const GET = route(
  async (_req, { user }) => {
    const { profile, updatedAt } = await schoolSettingsView(user!);
    return NextResponse.json({ data: profile, updatedAt });
  },
  { permission: "settings:read" },
);

/** PUT /api/admin/settings — replaces the school profile. Money is integer paise. */
export const PUT = route(
  async (req, { user }) => {
    const input = await parseJson(req, schoolProfileSchema);
    return NextResponse.json({ data: await updateSchoolProfile(user!, input) });
  },
  { permission: "settings:write" },
);
