import { route } from "@/lib/api";
import { dataBundle } from "@/lib/services/privacy";

/**
 * GET /api/admin/privacy/[id]/bundle — everything held about the subject of an EXPORT request, as a JSON download.
 * Medical records, internal notes and credentials are never included. Each download is audit-logged as `privacy.bundle`.
 */
export const GET = route<{ id: string }>(
  async (_req, { user, params }) => {
    const { bundle, filename } = await dataBundle(user!, params.id);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { permission: "privacy:manage" },
);
