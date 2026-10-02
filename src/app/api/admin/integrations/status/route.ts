import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { cronOverview, integrationOverview } from "@/lib/services/settings-integrations";

/**
 * GET /api/admin/integrations/status — each adapter's mode (MOCK / LIVE / OFF), whether its variables are set
 * (names only, never values) and the last runs of every scheduled job.
 */
export const GET = route(
  async (_req, { user }) =>
    NextResponse.json({
      data: { integrations: integrationOverview(user!), cron: await cronOverview(user!) },
    }),
  { permission: "settings:read" },
);
