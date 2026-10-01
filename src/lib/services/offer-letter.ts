import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { OfferLetterPdf } from "@/lib/pdf/offer-letter";

export async function offerLetterPdf(applicationId: string): Promise<Buffer> {
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      class: true,
      startYear: true,
      student: {
        include: {
          invoices: {
            where: { status: { not: "VOID" } },
            include: { instalments: { orderBy: { seq: "asc" } } },
            orderBy: { issuedAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!app.offerIssuedAt) throw new ApiError(409, "NO_OFFER", "No offer has been made for this application.");
  const inv = app.student?.invoices[0];
  const parent = ((app.guardians as { name?: string }[])[0]?.name ?? "Parent").trim();
  return renderToBuffer(
    createElement(OfferLetterPdf, {
      d: {
        ref: app.ref,
        parentName: parent,
        childName: `${app.childFirstName} ${app.childLastName}`,
        className: app.class.name,
        boarding: `${app.boardingType.charAt(0)}${app.boardingType.slice(1).toLowerCase()} boarding`,
        session: app.startYear.name,
        issuedAt: app.offerIssuedAt,
        acceptBy: app.offerExpiresAt ?? new Date(app.offerIssuedAt.getTime() + 14 * 86400_000),
        invoice: inv
          ? { number: inv.number, totalPaise: inv.totalPaise, instalments: inv.instalments }
          : null,
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
}
