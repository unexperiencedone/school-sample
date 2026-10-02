import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { route } from "@/lib/api";
import { applicationForPdf } from "@/lib/services/careers-admin";
import { StaffApplicationPdf } from "@/lib/pdf/staff-application";

export const runtime = "nodejs";

/** GET /api/admin/staff-applications/[id]/pdf — the application as a PDF. Needs careers:read; each download is audit-logged. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const d = await applicationForPdf(user!, params.id);
    const pdf = await renderToBuffer(
      createElement(StaffApplicationPdf, { d }) as ReactElement<DocumentProps>,
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${d.ref}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { permission: "careers:read" },
);
