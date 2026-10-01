import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { db } from "@/lib/db";

/** GET /api/payments/status?order= — minimal order status for the return page poller (no personal data). */
export const GET = route(async (req) => {
  const id = new URL(req.url).searchParams.get("order") ?? "";
  const order = await db.paymentOrder.findUnique({
    where: { providerOrderId: id },
    select: { status: true },
  });
  return NextResponse.json(
    { status: order?.status ?? "UNKNOWN" },
    { headers: { "Cache-Control": "no-store" } },
  );
});
