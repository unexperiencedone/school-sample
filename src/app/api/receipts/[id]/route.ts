import { route } from "@/lib/api";
import { receiptPdf } from "@/lib/services/fee-documents";

export const runtime = "nodejs";

/** GET /api/receipts/[id] — receipt PDF for finance staff, the pupil's guardians, or the paying applicant. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const { pdf, filename } = await receiptPdf(user!, params.id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { auth: true },
);
