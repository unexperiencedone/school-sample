import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { verifyReturn } from "@/lib/services/payments";

/** POST /api/payments/verify — client-return verification (order id, payment id, signature). */
export const POST = route(async (req) => {
  const body = await parseJson(
    req,
    z.object({
      orderId: z.string().min(1),
      paymentId: z.string().min(1),
      signature: z.string().min(1).max(4000),
    }),
  );
  const { status } = await verifyReturn(body);
  return NextResponse.json({ status });
});
