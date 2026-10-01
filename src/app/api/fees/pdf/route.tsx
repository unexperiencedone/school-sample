import { renderToBuffer } from "@react-pdf/renderer";
import type { BoardingType } from "@prisma/client";
import { route, ApiError } from "@/lib/api";
import { publicFeeSchedule } from "@/lib/services/fee-data";
import { FeeSchedulePdf } from "@/lib/pdf/fee-schedule";

export const runtime = "nodejs";
const VALID: BoardingType[] = ["FULL", "FLEXI", "DAY"];

/** GET /api/fees/pdf?boarding=FULL,FLEXI&year=2027-28 — fee structure PDF from live fee-engine data. */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const boarding = (url.searchParams.get("boarding") ?? "FULL")
    .split(",")
    .filter((b): b is BoardingType => VALID.includes(b as BoardingType));
  if (!boarding.length) throw new ApiError(400, "BAD_REQUEST", "boarding must be FULL, FLEXI and/or DAY");
  const schedule = await publicFeeSchedule(boarding, url.searchParams.get("year") ?? undefined);
  if (!schedule) throw new ApiError(404, "NOT_FOUND", "No fee schedule for that year");
  const pdf = await renderToBuffer(<FeeSchedulePdf schedule={schedule} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aurelia-hall-fees-${schedule.year.name}-${boarding.join("-").toLowerCase()}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
});
