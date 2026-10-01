import { ApiError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { offerLetterPdf } from "@/lib/services/offer-letter";

export const runtime = "nodejs";

/** GET /api/applicant/applications/[id]/offer-letter — the family's own offer letter. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const app = await db.application.findUnique({
      where: { id: params.id },
      select: { applicantUserId: true, ref: true },
    });
    if (!app || app.applicantUserId !== user!.id) throw new ApiError(404, "NOT_FOUND", "Not found");
    const pdf = await offerLetterPdf(params.id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="offer-${app.ref}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { auth: true },
);
