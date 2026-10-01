import { renderToBuffer } from "@react-pdf/renderer";
import { ApiError, route } from "@/lib/api";
import { BLANK_FORMS, BlankFormPdf } from "@/lib/pdf/blank-form";

export const runtime = "nodejs";

/** GET /api/resources/[slug] — printable blank forms listed on /resources. */
export const GET = route<{ slug: string }>(async (_req, { params }) => {
  const form = BLANK_FORMS[params.slug];
  if (!form) throw new ApiError(404, "NOT_FOUND", "Unknown resource");
  const pdf = await renderToBuffer(<BlankFormPdf {...form} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aurelia-hall-${params.slug}.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
});
