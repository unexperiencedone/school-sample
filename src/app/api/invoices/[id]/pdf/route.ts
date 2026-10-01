import { route } from "@/lib/api";
import { invoicePdf } from "@/lib/services/fee-documents";

export const runtime = "nodejs";

/** GET /api/invoices/[id]/pdf — the fee invoice PDF for finance staff or the pupil's guardians. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const { pdf, filename } = await invoicePdf(user!, params.id);
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
