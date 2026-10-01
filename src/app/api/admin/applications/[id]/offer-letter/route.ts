import { route } from "@/lib/api";
import { offerLetterPdf } from "@/lib/services/offer-letter";

export const runtime = "nodejs";

/** GET /api/admin/applications/[id]/offer-letter — offer letter PDF (staff). */
export const GET = route<{ id: string }>(
  async (_req, { params }) => {
    const pdf = await offerLetterPdf(params.id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="offer-${params.id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { permission: "applications:read" },
);
