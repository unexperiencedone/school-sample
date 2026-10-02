import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { ApiError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { initials } from "@/lib/utils";
import { IdCardPdf } from "@/lib/pdf/id-card";
import { BOARDING_LABEL } from "@/lib/services/fee-data";

export const runtime = "nodejs";

/** GET /api/admin/students/[id]/id-card — printable CR80 ID card. */
export const GET = route<{ id: string }>(
  async (_req, { params }) => {
    const s = await db.student.findUnique({
      where: { id: params.id },
      include: { class: true, section: true, house: true },
    });
    if (!s || !["ACTIVE", "PROSPECTIVE"].includes(s.status))
      throw new ApiError(404, "NOT_FOUND", "No current pupil with that id");
    const year = await db.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
    const pdf = await renderToBuffer(
      createElement(IdCardPdf, {
        d: {
          name: `${s.firstName} ${s.lastName}`,
          admissionNo: s.admissionNo,
          className: `${s.class.name}${s.section ? ` ${s.section.name}` : ""}`,
          house: s.house?.name ?? null,
          houseColour: s.house?.colour ?? null,
          boarding: BOARDING_LABEL[s.boardingType].replace(" boarding", ""),
          validTo: formatDate(year.endDate, "MMM yyyy"),
          initials: initials(`${s.firstName} ${s.lastName}`),
        },
      }) as ReactElement<DocumentProps>,
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="id-${s.admissionNo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { permission: "students:read" },
);
